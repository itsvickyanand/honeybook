/**
 * List the tenant's WhatsApp message templates (from Meta Business Cloud API).
 * Falls back to a mock list if not configured.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';

export async function GET() {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const token = process.env.WHATSAPP_TOKEN;
  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!token || !wabaId) {
    return NextResponse.json({
      mock: true,
      templates: [
        { name: 'proposal_sent', language: 'en', status: 'APPROVED', category: 'UTILITY' },
        { name: 'payment_received', language: 'en', status: 'APPROVED', category: 'UTILITY' },
        { name: 'invoice_reminder', language: 'en', status: 'PENDING', category: 'UTILITY' },
      ],
    });
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,language,status,category,components`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return NextResponse.json({ error: `Meta ${res.status}` }, { status: 502 });
  const data = (await res.json()) as { data: unknown[] };
  return NextResponse.json({ templates: data.data });
}
