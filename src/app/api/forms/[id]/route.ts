import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const actionSchema = z.object({
  type: z.string().min(1),
  props: z.record(z.unknown()).optional(),
});

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  fields: z.array(z.unknown()).optional(),
  redirectUrl: z.string().nullable().optional(),
  active: z.boolean().optional(),
  // Phase 2: action-chain edits land here.
  actions: z.array(actionSchema).optional(),
  formType: z.string().optional(),
  category: z.enum(['LEAD', 'CONTACT']).optional(),
  notifyEmails: z.array(z.string().email()).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  // Ensure the form belongs to this tenant before mutating.
  const existing = await prisma.leadForm.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.leadForm.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.fields !== undefined && { fieldsJson: parsed.data.fields as object }),
      ...(parsed.data.redirectUrl !== undefined && { redirectUrl: parsed.data.redirectUrl }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      ...(parsed.data.actions !== undefined && { actionsJson: parsed.data.actions as object }),
      ...(parsed.data.formType !== undefined && { formType: parsed.data.formType }),
      ...(parsed.data.category !== undefined && { category: parsed.data.category }),
      ...(parsed.data.notifyEmails !== undefined && {
        notifyEmails: parsed.data.notifyEmails === null
          ? Prisma.JsonNull
          : (parsed.data.notifyEmails as Prisma.InputJsonValue),
      }),
    },
  });
  return NextResponse.json({ form: updated });
}
