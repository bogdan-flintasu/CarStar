import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRICES } from '@/lib/pricing';

// In-memory stand-in for Prisma: one price row and a captured configuration.create().
const db = vi.hoisted(() => ({
  prices: null as Record<string, unknown> | null,
  created: [] as Array<{ data: Record<string, unknown> }>,
  saved: null as { data: unknown } | null,
  colors: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    prices: {
      findFirst: async () => db.prices,
      create: async ({ data }: { data: Record<string, unknown> }) => (db.prices = { id: 'p', ...data }),
    },
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
      findUnique: async () => db.saved,
    },
  },
}));

const { POST: createConfiguration } = await import('./route');
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
    } finally {
      log.mockRestore();
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
    }
  });
});
