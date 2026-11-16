import { NextResponse, type NextRequest } from 'next/server';
import { getAuthSecret, SESSION_COOKIE, verifySessionToken, type SessionPayload } from './session';

/** The admin session carried by this request, or null. */
export function getAdminSession(req: Pick<NextRequest, 'cookies'>): SessionPayload | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, getAuthSecret());
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Route-handler guard (defence in depth on top of src/proxy.ts).
 * Returns a 401 response to send back, or null when the request is authenticated.
 */
export function requireAdmin(req: Pick<NextRequest, 'cookies'>): NextResponse | null {
  return getAdminSession(req) ? null : unauthorized();
}
