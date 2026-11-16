import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSession, unauthorized } from '@/lib/auth/guard';

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (Node.js runtime).
// Protects the admin UI and the admin API. Route handlers re-check the session.

const LOGIN_PATH = '/admin/login';

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) {
    return NextResponse.next();
  }

  if (getAdminSession(req)) {
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }

  if (pathname.startsWith('/api/')) return unauthorized();

  const loginUrl = new URL(LOGIN_PATH, req.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};
