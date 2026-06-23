import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { nanoid } from 'nanoid';
import { findStarterTemplate } from '@/lib/forms/starter-templates';

const fieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'number']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

const inlineSchema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(fieldSchema),
  redirectUrl: z.string().url().optional().or(z.literal('')),
  notifyEmails: z.array(z.string().email()).optional(),
  formType: z.string().optional(),
  category: z.enum(['LEAD', 'CONTACT']).optional(),
});

/** Phase 1 "Create new" templates: client posts just { templateKey } and we
 *  clone the starter's defaults into a new LeadForm. */
const fromTemplateSchema = z.object({
  templateKey: z.string().min(1),
});

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const forms = await prisma.leadForm.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ forms });
}

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);

  // Templated create path — the new "+ New form → pick a type" flow.
  const fromTpl = fromTemplateSchema.safeParse(body);
  if (fromTpl.success) {
    const tpl = findStarterTemplate(fromTpl.data.templateKey);
    if (!tpl) return NextResponse.json({ error: 'Unknown template' }, { status: 400 });

    const baseSlug = `${auth.tenant.slug}-${slugify(tpl.defaults.name)}`;
    let slug = baseSlug;
    while (await prisma.leadForm.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${nanoid(4)}`;
    }

    const form = await prisma.leadForm.create({
      data: {
        tenantId: auth.tenant.id,
        slug,
        name: tpl.defaults.name,
        title: tpl.defaults.title,
        description: tpl.defaults.description,
        fieldsJson: tpl.defaults.fields as object,
        formType: tpl.formType,
        category: tpl.category,
        actionsJson: tpl.actions as object,
        active: false, // safer default — vendor reviews then enables
      },
    });
    return NextResponse.json({ form, fromTemplate: tpl.key });
  }

  // Legacy inline-fields create path (preserves backwards-compat with existing UI).
  const parsed = inlineSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  let slug = `${auth.tenant.slug}-${slugify(parsed.data.name)}`;
  while (await prisma.leadForm.findUnique({ where: { slug } })) {
    slug = `${slug}-${nanoid(4)}`;
  }

  const form = await prisma.leadForm.create({
    data: {
      tenantId: auth.tenant.id,
      slug,
      name: parsed.data.name,
      title: parsed.data.title,
      description: parsed.data.description,
      fieldsJson: parsed.data.fields as object,
      redirectUrl: parsed.data.redirectUrl || null,
      notifyEmails: parsed.data.notifyEmails as object | undefined,
      formType: parsed.data.formType ?? 'CUSTOM',
      category: parsed.data.category ?? 'LEAD',
    },
  });
  return NextResponse.json({ form });
}
