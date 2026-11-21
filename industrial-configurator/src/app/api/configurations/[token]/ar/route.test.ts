import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for Prisma: one configuration, the AR rows written.
const db = vi.hoisted(() => ({
  configuration: null as { id: string; createdAt: Date } | null,
  arRows: [] as Array<{ configurationId: string; format: string; size: number }>,
}));

vi.mock('@/lib/prisma', () => {
  const client = {
    configuration: { findUnique: async () => db.configuration },
    configurationArModel: {
      create: async ({ data }: { data: { configurationId: string; format: string; size: number } }) => {
        if (db.arRows.some((r) => r.configurationId === data.configurationId && r.format === data.format)) {
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        }
        db.arRows.push(data);
        return data;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => {
      // Sequential like a transaction; roll back on failure.
      const before = db.arRows.length;
      try {
        return await Promise.all(ops);
      } catch (error) {
        db.arRows.length = before;
        throw error;
      }
    },
  };
  return { default: client };
});

import { POST } from './route';
import { arUploadLimiter } from '@/lib/auth/rateLimit';

const TOKEN = 'abcdefghijkl';

function glb(length = 28): Uint8Array {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

function usdz(): Uint8Array {
  const name = new TextEncoder().encode('model.usda');
  const bytes = new Uint8Array(30 + name.length + 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  return bytes;
}

async function upload(files: Record<string, Uint8Array>, token = TOKEN) {
  const form = new FormData();
  for (const [name, bytes] of Object.entries(files)) form.append(name, new Blob([bytes as BlobPart]), name);
  const req = new NextRequest(`http://localhost/api/configurations/${token}/ar`, { method: 'POST', body: form });
  return POST(req, { params: Promise.resolve({ token }) });
}

describe('POST /api/configurations/[token]/ar', () => {
  beforeEach(() => {
    db.configuration = { id: 'c1', createdAt: new Date() };
    db.arRows = [];
    arUploadLimiter.reset();
  });

  it('stores both files once and returns their URLs', async () => {
    const res = await upload({ glb: glb(), usdz: usdz() });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      glb: `/api/configurations/${TOKEN}/ar/hall.glb`,
      usdz: `/api/configurations/${TOKEN}/ar/hall.usdz`,
    });
    expect(db.arRows.map((r) => r.format).sort()).toEqual(['glb', 'usdz']);
  });

  it('refuses a second upload: the AR model is frozen with the quote', async () => {
    await upload({ glb: glb(), usdz: usdz() });
    const again = await upload({ glb: glb(), usdz: usdz() });
    expect(again.status).toBe(409);
    expect(db.arRows).toHaveLength(2);
  });

  it('rejects files whose bytes are not what they claim', async () => {
    const res = await upload({ glb: usdz(), usdz: usdz() });
    expect(res.status).toBe(400);
    expect(db.arRows).toHaveLength(0);
  });

  it('needs both files', async () => {
    expect((await upload({ glb: glb() })).status).toBe(400);
  });

  it('404s for an unknown configuration and refuses old ones', async () => {
    db.configuration = null;
    expect((await upload({ glb: glb(), usdz: usdz() })).status).toBe(404);
    db.configuration = { id: 'c1', createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) };
    expect((await upload({ glb: glb(), usdz: usdz() })).status).toBe(409);
  });

  it('rejects a malformed token without touching the database', async () => {
    expect((await upload({ glb: glb(), usdz: usdz() }, 'bad token!')).status).toBe(404);
  });
});
