// List call logs for the current tenant. Supports ?contactId= / ?leadId= /
// ?phone= filters. Always scoped to the caller's tenant.
import { getCurrentContext } from '@/lib/session';
import { listCallLogs } from '@/dialer/server/store.js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get('contactId') || undefined;
  const leadId = searchParams.get('leadId') || undefined;
  const phone = searchParams.get('phone') || undefined;
  try {
    const logs = await listCallLogs({ tenantId: ctx.tenant.id, contactId, leadId, phone });
    return Response.json({ logs });
  } catch (error) {
    console.error('[dialer] list logs error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
