/**
 * AI: 4-6 bullet summary of the project for the vendor.
 * Used by the "Summarize this project" action in the workspace toolbar.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { summarizeProject } from '@/lib/ai/project-actions';
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
    const out = await summarizeProject(auth.tenant.id, id);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
