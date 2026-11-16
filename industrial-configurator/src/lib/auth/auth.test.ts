import { afterEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { createSessionToken, verifySessionToken } from './session';
import { verifyAdminCredentials } from './password';
import { createRateLimiter, getClientIp } from './rateLimit';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

describe('session token', () => {
  it('round-trips a valid token', () => {
    const token = createSessionToken('admin', SECRET, 1000, 60);
    expect(verifySessionToken(token, SECRET, 1010)).toMatchObject({ sub: 'admin', exp: 1060 });
  });

  it('rejects expired, tampered, wrong-secret and malformed tokens', () => {
    const token = createSessionToken('admin', SECRET, 1000, 60);
    expect(verifySessionToken(token, SECRET, 1060)).toBeNull();
    expect(verifySessionToken(token, `${SECRET}x`, 1010)).toBeNull();
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', iat: 0, exp: 9e9 })).toString('base64url');
    expect(verifySessionToken(`${forged}.${sig}`, SECRET, 1010)).toBeNull();
    expect(verifySessionToken(`${body}.`, SECRET, 1010)).toBeNull();
    expect(verifySessionToken('garbage', SECRET, 1010)).toBeNull();
    expect(verifySessionToken(token, null, 1010)).toBeNull();
    expect(verifySessionToken(undefined, SECRET)).toBeNull();
  });
});

describe('verifyAdminCredentials', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('checks username and bcrypt password from env', async () => {
    process.env.ADMIN_USERNAME = 'boss';
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('correct horse', 4);
    expect(await verifyAdminCredentials('boss', 'correct horse')).toBe(true);
    expect(await verifyAdminCredentials('boss', 'wrong')).toBe(false);
    expect(await verifyAdminCredentials('admin', 'correct horse')).toBe(false);
  });

  it('fails closed when env is not configured', async () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(await verifyAdminCredentials('admin', 'admin')).toBe(false);
  });
});

describe('rate limiter', () => {
  it('allows `limit` requests per window, then blocks until reset', () => {
    const rl = createRateLimiter(2, 1000);
    expect(rl.check('ip', 0).allowed).toBe(true);
    expect(rl.check('ip', 10).allowed).toBe(true);
    const blocked = rl.check('ip', 20);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rl.check('other', 20).allowed).toBe(true);
    expect(rl.check('ip', 1001).allowed).toBe(true);
  });

  it('reads the first X-Forwarded-For hop', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(getClientIp(new Headers({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});
