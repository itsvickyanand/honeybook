// Fetch a single call log (full detail) by id, scoped to the caller's tenant.
import { getCurrentContext } from '@/lib/session';
import { getCallLogById } from '@/dialer/server/store.js';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentContext();
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const log = await getCallLogById(id);
    if (!log || (log.tenantId && log.tenantId !== session.tenant.id)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ log });
  } catch (error) {
    console.error('[dialer] get log error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
