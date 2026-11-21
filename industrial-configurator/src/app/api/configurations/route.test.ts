import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRICES } from '@/lib/pricing';

// In-memory stand-in for Prisma: one price row and a captured configuration.create().
const db = vi.hoisted(() => ({
  prices: null as Record<string, unknown> | null,
  created: [] as Array<{ data: Record<string, unknown> }>,
  saved: null as { data: unknown } | null,
  colors: [] as Array<Record<string, unknown>>,
  images: [] as Array<{ configurationId: string; view: string; bytes: Uint8Array; width: number; height: number; mime: string }>,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    prices: {
      findFirst: async () => db.prices,
      create: async ({ data }: { data: Record<string, unknown> }) => (db.prices = { id: 'p', ...data }),
    },
    hallModel: {
      findUnique: async () => null,
    },
    organization: {
      findUnique: async () => ({
        id: 'default',
        name: '',
        address: '',
        phone: '+40 700 000 000',
        email: '',
        website: '',
        brand: { displayName: 'Firma Test', logoAssetId: null, primaryColor: '#dc2626' },
      }),
    },
    asset: { findUnique: async () => null },
    colorOption: {
      count: async () => db.colors.length,
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        db.colors.push(...data);
        return { count: data.length };
      },
      findMany: async () => db.colors,
    },
    configuration: {
      create: async (args: { data: Record<string, unknown> }) => {
        db.created.push(args);
        return { id: 'c', ...args.data };
      },
      findUnique: async () => db.saved && { id: 'c', ...db.saved },
      delete: async () => ({}),
    },
    configurationArModel: { findMany: async () => [] },
    configurationImage: {
      upsert: async ({ create }: { create: (typeof db.images)[number] }) => {
        db.images.push(create);
        return create;
      },
      findMany: async () => db.images,
    },
  },
}));

const { POST: createConfiguration } = await import('./route');
const sharp = (await import('sharp')).default;
const { POST: sendEmail } = await import('../send-email/route');

const tamperedData = {
  dimensions: { length: 12, width: 12, height: 3 },
  foundation: true,
  sandwichPanels: false,
  insulation: 0,
  openings: { windows: 0, doors: 0, garageDoors: 0 },
  openingsList: [
    { id: 'w1', type: 'window', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1 },
  ],
  floorArea: 1,
  estimatedPrice: 1,
};

function post(url: string, body: unknown, ip: string) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });
}

describe('server-side price (B5)', () => {
  beforeEach(() => {
    db.prices = { id: 'p', ...DEFAULT_PRICES, structurePerM3: 100, updatedAt: new Date() };
    db.created = [];
    db.saved = null;
    db.images = [];
  });

  it('POST /api/configurations stores the server price, not the client one', async () => {
    const res = await createConfiguration(
      post('http://localhost/api/configurations', { data: tamperedData }, '10.0.0.1'),
    );
    expect(res.status).toBe(201);
    const stored = db.created[0].data.data as Record<string, unknown>;
    // 432 m3 * 100 (DB price) + 1 window * 150 + 144 m2 * 35
    expect(stored.estimatedPrice).toBe(43200 + 150 + 5040);
    expect(stored.floorArea).toBe(144);
    expect(stored.openings).toEqual({ windows: 1, doors: 0, garageDoors: 0 });
  });

  it('POST /api/configurations freezes the branding into the quote', async () => {
    const res = await createConfiguration(
      post('http://localhost/api/configurations', { data: tamperedData }, '10.0.0.9'),
    );
    expect(res.status).toBe(201);
    const row = db.created[0].data;
    expect(row.organizationId).toBe('default');
    expect(row.brandingSnapshot).toMatchObject({ v: 1, name: 'Firma Test', phone: '+40 700 000 000', colors: { primary: '#dc2626' } });
  });

  it('POST /api/send-email quotes the server price', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const prevKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const res = await sendEmail(
        post(
          'http://localhost/api/send-email',
          {
            email: 'ion@example.com',
            configurationSummary: { ...tamperedData, openingsList: undefined, estimatedPrice: 1 },
          },
          '10.0.0.2',
        ),
      );
      expect(res.status).toBe(200);
      const output = log.mock.calls.map((c) => String(c[0])).join('\n');
      // Counts only (no list): 0 openings -> 43200 + 5040
      expect(output).toContain('Preț:       48240');
      expect(output).not.toMatch(/Preț:\s+1$/m);
    } finally {
      log.mockRestore();
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
    }
  });

  it('POST /api/send-email with a link uses the saved configuration', async () => {
    db.saved = { data: { ...tamperedData, dimensions: { length: 24, width: 12, height: 3 } } };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const prevKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const res = await sendEmail(
        post(
          'http://localhost/api/send-email',
          {
            email: 'ion@example.com',
            configurationLink: 'http://localhost/configuration/AbC_123-xyz0',
            configurationSummary: { ...tamperedData, estimatedPrice: 1 },
          },
          '10.0.0.3',
        ),
      );
      expect(res.status).toBe(200);
      const output = log.mock.calls.map((c) => String(c[0])).join('\n');
      // 864 m3 * 100 + 1 window * 150 + 288 m2 * 35
      expect(output).toContain(`Preț:       ${86400 + 150 + 10080}`);
      // The PDF quote is built server-side from the token (console fallback: logged, not sent).
      expect(output).toMatch(/PDF:\s+s-ar atașa oferta-hala-AbC_123-xyz0\.pdf \(\d+ KB\)/);
    } finally {
      log.mockRestore();
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
    }
  });
});

describe('POST /api/configurations with pictures (multipart)', () => {
  const jpeg = async (width = 1600, height = 1000) =>
    new Uint8Array(
      await sharp({ create: { width, height, channels: 3, background: { r: 90, g: 120, b: 160 } } }).jpeg().toBuffer(),
    );

  /** A multipart request as a browser sends it: serialised body with its length. */
  async function upload(fields: Array<[string, string | Blob, string?]>, ip: string) {
    const form = new FormData();
    for (const [name, value, filename] of fields) {
      if (typeof value === 'string') form.append(name, value);
      else form.append(name, value, filename);
    }
    const encoded = new Response(form);
    const body = new Uint8Array(await encoded.arrayBuffer());
    return new NextRequest('http://localhost/api/configurations', {
      method: 'POST',
      body,
      headers: {
        'content-type': encoded.headers.get('content-type')!,
        'content-length': String(body.byteLength),
        'x-forwarded-for': ip,
      },
    });
  }
  const payload = JSON.stringify({ data: tamperedData });

  beforeEach(() => {
    db.prices = { id: 'p', ...DEFAULT_PRICES, updatedAt: new Date() };
    db.created = [];
    db.images = [];
  });

  it('stores the configuration with its pictures', async () => {
    const bytes = await jpeg();
    const res = await createConfiguration(
      await upload(
        [
          ['payload', payload],
          ['render-front', new Blob([bytes], { type: 'image/jpeg' }), 'front.jpg'],
          ['render-aerial', new Blob([bytes], { type: 'image/jpeg' }), 'aerial.jpg'],
        ],
        '10.1.0.1',
      ),
    );
    expect(res.status).toBe(201);
    expect(db.created).toHaveLength(1);
    expect(db.images.map((i) => [i.view, i.mime, i.width, i.height])).toEqual([
      ['front', 'image/jpeg', 1600, 1000],
      ['aerial', 'image/jpeg', 1600, 1000],
    ]);
  });

  it('checks the bytes, not the declared type', async () => {
    const png = new Uint8Array(await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#fff' } }).png().toBuffer());
    const res = await createConfiguration(
      await upload([['payload', payload], ['render-front', new Blob([png], { type: 'image/jpeg' }), 'front.jpg']], '10.1.0.2'),
    );
    expect(res.status).toBe(400);
    expect(db.created).toHaveLength(0);
  });

  it('rejects unknown views, unknown fields and a missing payload', async () => {
    const bytes = new Blob([await jpeg()], { type: 'image/jpeg' });
    const cases: Array<Array<[string, string | Blob, string?]>> = [
      [['payload', payload], ['render-interior', bytes, 'x.jpg']],
      [['payload', payload], ['avatar', bytes, 'x.jpg']],
      [['payload', payload], ['render-front', bytes, 'a.jpg'], ['render-front', bytes, 'b.jpg']],
      [['render-front', bytes, 'a.jpg']],
      [['payload', '{"data":{}}']],
    ];
    for (const [i, fields] of cases.entries()) {
      const res = await createConfiguration(await upload(fields, `10.1.1.${i}`));
      expect(res.status).toBe(400);
    }
    expect(db.created).toHaveLength(0);
  });

  it('caps the body size', async () => {
    const huge = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/jpeg' });
    const res = await createConfiguration(await upload([['payload', payload], ['render-front', huge, 'a.jpg']], '10.1.2.1'));
    expect(res.status).toBe(413);
  });

  it('keeps the small limit for JSON bodies', async () => {
    const res = await createConfiguration(
      post('http://localhost/api/configurations', { data: tamperedData, pad: 'x'.repeat(70 * 1024) }, '10.1.2.2'),
    );
    expect(res.status).toBe(413);
  });
});
