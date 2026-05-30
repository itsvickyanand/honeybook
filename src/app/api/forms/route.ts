import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { nanoid } from 'nanoid';

const fieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'number']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

const schema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(fieldSchema),
  redirectUrl: z.string().url().optional().or(z.literal('')),
  notifyEmails: z.array(z.string().email()).optional(),
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
  const parsed = schema.safeParse(await req.json().catch(() => null));
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
    },
  });
  return NextResponse.json({ form });
}
