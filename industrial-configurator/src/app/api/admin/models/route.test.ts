import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HallModelData } from '@/lib/validation/models';

// In-memory stand-ins for Prisma and the admin session.
const state = vi.hoisted(() => ({
  admin: true,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/auth/guard', async () => {
  const { NextResponse } = await import('next/server');
  const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return {
    unauthorized,
    requireAdmin: () => (state.admin ? null : unauthorized()),
    getAdminSession: () => (state.admin ? { sub: 'admin' } : null),
  };
});

vi.mock('@/lib/prisma', () => {
  const pick = (row: Record<string, unknown>, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : row;
  const matches = (row: Record<string, unknown>, where?: Record<string, unknown>) => {
    if (!where) return true;
    if ('published' in where && row.published !== where.published) return false;
    if ('id' in where) {
      const id = where.id as string | { in: string[] };
      if (typeof id === 'string' ? row.id !== id : !id.in.includes(row.id as string)) return false;
    }
    if ('NOT' in where && row.thumbnail === (where.NOT as { thumbnail: string }).thumbnail) return false;
    return true;
  };
  const hallModel = {
    findMany: async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) =>
      state.rows
        .filter((r) => matches(r, where))
        .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number))
        .map((r) => pick(r, select)),
    findFirst: async () => [...state.rows].sort((a, b) => (b.sortOrder as number) - (a.sortOrder as number))[0] ?? null,
    findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
      const row = state.rows.find((r) => r.id === where.id);
      return row ? pick(row, select) : null;
    },
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const row = { id: `m${state.rows.length + 1}`, description: '', published: true, updatedAt: new Date(1000), ...data };
      state.rows.push(row);
      return pick(row, select);
    },
    update: async ({ where, data, select }: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const row = state.rows.find((r) => r.id === where.id)!;
      Object.assign(row, data, { updatedAt: new Date(2000) });
      return pick(row, select);
    },
    deleteMany: async ({ where }: { where: { id: string } }) => {
      const before = state.rows.length;
      state.rows = state.rows.filter((r) => r.id !== where.id);
      return { count: before - state.rows.length };
    },
  };
  return { default: { hallModel } };
});

const adminList = await import('./route');
const adminOne = await import('./[id]/route');
const publicList = await import('../../models/route');
const thumbnail = await import('../../models/[id]/thumbnail/route');

const data: HallModelData = {
  dimensions: { length: 24, width: 12, height: 5 },
  roofType: 'mono',
  highSide: 'left',
  foundation: true,
  sandwichPanels: true,
  insulation: 100,
  openingsList: [{ id: 'g1', type: 'garageDoor', wallId: 'PereteFata', offsetX: 2, sill: 0, width: 4, height: 4 }],
  colors: { walls: { id: 'walls-ral7016', name: 'Antracit', hex: '#383e42' } },
};
// A 1 x 1 PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.admin = true;
  state.rows = [];
});

describe('predefined hall models API', () => {
  it('lets only admins create, edit and delete', async () => {
    state.admin = false;
    expect((await adminList.POST(req('/api/admin/models', 'POST', { name: 'X', data }))).status).toBe(401);
    expect((await adminList.GET(req('/api/admin/models'))).status).toBe(401);
    expect((await adminOne.PATCH(req('/api/admin/models/m1', 'PATCH', { name: 'Y' }), ctx('m1'))).status).toBe(401);
    expect((await adminOne.DELETE(req('/api/admin/models/m1', 'DELETE'), ctx('m1'))).status).toBe(401);
  });

  it('creates a model with its picture and lists it publicly without the picture data', async () => {
    const res = await adminList.POST(req('/api/admin/models', 'POST', { name: ' Depozit ', data, thumbnail: PNG }));
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.name).toBe('Depozit');
    expect(created.thumbnailUrl).toMatch(/^\/api\/models\/m1\/thumbnail\?v=\d+$/);

    const list = await (await publicList.GET()).json();
    expect(list).toHaveLength(1);
    expect(list[0].data).toEqual(data);
    expect(JSON.stringify(list)).not.toContain('base64');

    const image = await thumbnail.GET(req('/api/models/m1/thumbnail'), ctx('m1'));
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
  });

  it('hides unpublished models and their pictures from customers', async () => {
    await adminList.POST(req('/api/admin/models', 'POST', { name: 'Ascuns', data, thumbnail: PNG, published: false }));
    expect(await (await publicList.GET()).json()).toEqual([]);
    state.admin = false;
    expect((await thumbnail.GET(req('/api/models/m1/thumbnail'), ctx('m1'))).status).toBe(404);
    state.admin = true;
    const all = await (await adminList.GET(req('/api/admin/models'))).json();
    expect(all.map((m: { published: boolean }) => m.published)).toEqual([false]);
  });

  it('rejects bad input: no name, a non-image picture, an out-of-range hall', async () => {
    expect((await adminList.POST(req('/api/admin/models', 'POST', { name: '', data }))).status).toBe(400);
    expect(
      (await adminList.POST(req('/api/admin/models', 'POST', { name: 'X', data, thumbnail: 'data:text/html;base64,PHA+' }))).status,
    ).toBe(400);
    const tooWide = { ...data, dimensions: { ...data.dimensions, width: 50 } };
    expect((await adminList.POST(req('/api/admin/models', 'POST', { name: 'X', data: tooWide }))).status).toBe(400);
  });

  it('updates and deletes a model', async () => {
    await adminList.POST(req('/api/admin/models', 'POST', { name: 'A', data }));
    const patched = await adminOne.PATCH(req('/api/admin/models/m1', 'PATCH', { name: 'B', published: false }), ctx('m1'));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ name: 'B', published: false });
    expect((await adminOne.PATCH(req('/api/admin/models/m1', 'PATCH', {}), ctx('m1'))).status).toBe(400);
    expect((await adminOne.PATCH(req('/api/admin/models/nope', 'PATCH', { name: 'C' }), ctx('nope'))).status).toBe(404);
    expect((await adminOne.DELETE(req('/api/admin/models/m1', 'DELETE'), ctx('m1'))).status).toBe(204);
    expect((await adminOne.DELETE(req('/api/admin/models/m1', 'DELETE'), ctx('m1'))).status).toBe(404);
  });

  it('appends new models at the end of the order', async () => {
    await adminList.POST(req('/api/admin/models', 'POST', { name: 'Primul', data }));
    await adminList.POST(req('/api/admin/models', 'POST', { name: 'Al doilea', data }));
    const all = await (await adminList.GET(req('/api/admin/models'))).json();
    expect(all.map((m: { name: string; sortOrder: number }) => [m.name, m.sortOrder])).toEqual([
      ['Primul', 0],
      ['Al doilea', 1],
    ]);
  });
});
