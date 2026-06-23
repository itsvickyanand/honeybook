/**
 * AI: suggest 5-8 action items the vendor should consider creating as Tasks.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { suggestActionItems } from '@/lib/ai/project-actions';
import { parsePermissions, visibleProjectScope, projectInScope } from '@/lib/session';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const scope = await visibleProjectScope({
    userId: auth.user.id,
    tenantId: auth.tenant.id,
    permissions: parsePermissions(auth.role.permissions as unknown),
  });
  if (!projectInScope(scope, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const out = await suggestActionItems(auth.tenant.id, id);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
