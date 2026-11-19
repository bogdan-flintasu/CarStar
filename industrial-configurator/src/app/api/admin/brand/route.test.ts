import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: false, touched: false }));

// The real guard checks a signed cookie; here the session is a switch, and any database use is recorded.
vi.mock('@/lib/auth/guard', async () => {
  const { NextResponse } = await import('next/server');
  const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return { unauthorized, requireAdmin: () => (state.admin ? null : unauthorized()), getAdminSession: () => null };
});

vi.mock('@/lib/prisma', () => {
  const touch = async () => {
    state.touched = true;
    return null;
  };
  const model = { findUnique: touch, findFirst: touch, findUniqueOrThrow: touch, upsert: touch, update: touch, create: touch, delete: touch, findMany: async () => [] };
  return { default: { organization: model, brandIdentity: model, asset: model, appSetting: model, configuration: model } };
});

const brand = await import('./route');
const logo = await import('./logo/route');
const theme = await import('../theme/route');

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const req = (method: string, body?: BodyInit) => new NextRequest('http://localhost/api/admin/brand', { method, body });

describe('admin brand routes require the admin session', () => {
  beforeEach(() => {
    state.admin = false;
    state.touched = false;
  });

  it('rejects unauthenticated requests before touching anything', async () => {
    const form = JSON.stringify({ displayName: 'X' });
    const responses = await Promise.all([
      brand.GET(req('GET')),
      brand.PUT(req('PUT', form)),
      logo.POST(req('POST', PNG)),
      logo.DELETE(req('DELETE')),
      theme.GET(req('GET')),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(state.touched).toBe(false);
  });

  it('lets a signed-in admin through to validation (400 on a bad form, 400 on a file that is not an image)', async () => {
    state.admin = true;
    expect((await brand.PUT(req('PUT', JSON.stringify({ displayName: 'X', extra: true })))).status).toBe(400);
    expect((await logo.POST(req('POST', Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0])))).status).toBe(400);
    expect((await logo.POST(req('POST', new Uint8Array()))).status).toBe(400);
  });
});
