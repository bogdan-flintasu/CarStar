import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminCredentials } from '@/lib/auth/password';
import { getClientIp, loginLimiter } from '@/lib/auth/rateLimit';
import {
  createSessionToken,
  getAuthSecret,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { parseJsonBody } from '@/lib/validation/body';
import { loginSchema } from '@/lib/validation/auth';

// POST – Admin login. Sets a signed httpOnly session cookie.
export async function POST(req: NextRequest) {
  const limit = loginLimiter.check(`login:${getClientIp(req.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const secret = getAuthSecret();
  if (!secret) {
    console.error('Admin login unavailable: AUTH_SECRET is missing or shorter than 32 characters.');
    return NextResponse.json({ error: 'Authentication is not configured' }, { status: 503 });
  }

  const parsed = await parseJsonBody(req, loginSchema, 2 * 1024);
  if (!parsed.ok) return parsed.response;

  const { username, password } = parsed.data;
  if (!(await verifyAdminCredentials(username, password))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(username, secret), sessionCookieOptions);
  return res;
}
