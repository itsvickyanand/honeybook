/**
 * Proxy (Next.js 16, was "middleware"): gate /app/* to authenticated users.
 * We only check cookie presence here (cheap). Real verification happens server-side.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export function proxy(req: NextRequest) {
  const has = req.cookies.get(SESSION_COOKIE)?.value;
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*'],
};
