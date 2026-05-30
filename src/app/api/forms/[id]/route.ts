import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  fields: z.array(z.unknown()).optional(),
  redirectUrl: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const updated = await prisma.leadForm.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.fields !== undefined && { fieldsJson: parsed.data.fields as object }),
      ...(parsed.data.redirectUrl !== undefined && { redirectUrl: parsed.data.redirectUrl }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
    },
  });
  return NextResponse.json({ form: updated });
}
