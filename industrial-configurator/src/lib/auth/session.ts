import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Admin session: a stateless, HMAC-SHA256-signed token kept in an httpOnly
 * cookie. Format: base64url(JSON payload) + "." + base64url(signature).
 * Rotating AUTH_SECRET invalidates every session.
 */

export const SESSION_COOKIE = 'carstar_admin_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const MIN_SECRET_LENGTH = 32;

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

/** AUTH_SECRET from env, or null when missing/too short (auth then fails closed). */
export function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(
  sub: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = SESSION_TTL_SECONDS,
): string {
  const payload: SessionPayload = { sub, iat: nowSeconds, exp: nowSeconds + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** Returns the payload when the signature is valid and the token has not expired. */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token || !secret || token.length > 1024) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = Buffer.from(sign(body, secret), 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};
