/**
 * AI: drafts a client email tailored to the project's state.
 * Used by "Draft a client email" in the workspace toolbar.
 *
 * POST { kind?: 'status_update' | 'check_in' | 'payment_nudge' | 'next_steps' }
 *   → { subject, body, mock }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { draftClientEmail, type EmailKind } from '@/lib/ai/project-actions';
import { parsePermissions, visibleProjectScope, projectInScope } from '@/lib/session';

const schema = z.object({
  kind: z.enum(['status_update', 'check_in', 'payment_nudge', 'next_steps']).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const scope = await visibleProjectScope({
    userId: auth.user.id,
    tenantId: auth.tenant.id,
    permissions: parsePermissions(auth.role.permissions as unknown),
  });
  if (!projectInScope(scope, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  try {
    const out = await draftClientEmail(auth.tenant.id, id, (parsed.data.kind ?? 'status_update') as EmailKind);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
