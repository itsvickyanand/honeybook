/**
 * Step 1 of the Zoho OAuth dance: redirect the vendor's browser to Zoho's auth page.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';

export async function GET() {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  if (!process.env.ZOHO_CLIENT_ID) {
    return NextResponse.json({ error: 'Zoho not configured' }, { status: 400 });
  }
  const url = new URL('https://accounts.zoho.in/oauth/v2/auth');
  url.searchParams.set('scope', 'ZohoBooks.fullaccess.all');
  url.searchParams.set('client_id', process.env.ZOHO_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('redirect_uri', `${process.env.APP_URL ?? 'http://localhost:3000'}/api/accounting/zoho/callback`);
  url.searchParams.set('state', auth.tenant.id);
  return NextResponse.redirect(url.toString());
}
