/**
 * Vendor-triggered sync. Body: { provider, entityType, entityId }.
 * Enqueues an async push job; UI shows status via AccountingSyncLog.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { enqueue, JOB_NAMES } from '@/lib/queue';

const schema = z.object({
  provider: z.enum(['zoho', 'quickbooks', 'xero', 'tally', 'odoo']),
  entityType: z.enum(['invoice', 'payment', 'contact']),
  entityId: z.string(),
});

export async function POST(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  await enqueue(JOB_NAMES.ACCOUNTING_PUSH, {
    tenantId: auth.tenant.id,
    ...parsed.data,
  });
  return NextResponse.json({ ok: true, queued: true });
}
