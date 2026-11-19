import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRICES } from '@/lib/pricing';
import { brandingSnapshot, getBranding } from '@/lib/branding';

// In-memory stand-in for Prisma: one saved configuration, the CURRENT brand identity, a stored logo asset.
const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  assets: new Map<string, Record<string, unknown>>(),
  rendered: [] as Array<{ model: { company: { name: string; contact: string[]; colors: { primary: string } } }; assets: { logo: unknown } }>,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    prices: { findFirst: async () => ({ id: 'p', ...DEFAULT_PRICES, updatedAt: new Date() }) },
    hallModel: { findUnique: async () => null },
    colorOption: { count: async () => 1, createMany: async () => ({ count: 0 }), findMany: async () => [] },
    configuration: { findUnique: async () => db.row },
    configurationImage: { findMany: async () => [] },
    organization: {
      // The brand NOW: not the one frozen in the quote.
      findUnique: async () => ({
        id: 'default',
        name: '',
        address: 'Strada Nouă 1',
        phone: '',
        email: '',
        website: '',
        brand: { displayName: 'Firma Nouă', logoAssetId: 'newLogo', primaryColor: '#0000ff' },
      }),
    },
    asset: {
      findUnique: async ({ where }: { where: { id: string } }) => db.assets.get(where.id) ?? null,
    },
  },
}));

// The PDF itself is not under test: capture what the quote would show.
vi.mock('./quotePdf', () => ({
  renderQuotePdf: async (model: (typeof db.rendered)[number]['model'], assets: (typeof db.rendered)[number]['assets']) => {
    db.rendered.push({ model, assets });
    return Buffer.from('%PDF-fake');
  },
}));

const { buildQuotePdfForToken } = await import('./quoteForToken');

const data = {
  dimensions: { length: 12, width: 12, height: 3 },
  foundation: true,
  sandwichPanels: false,
  insulation: 0,
  openings: { windows: 0, doors: 0, garageDoors: 0 },
  openingsList: [],
  floorArea: 144,
  estimatedPrice: 1,
};

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('the PDF quote uses the branding frozen at save time', () => {
  beforeEach(() => {
    db.rendered = [];
    db.assets = new Map([
      ['oldLogo', { id: 'oldLogo', mime: 'image/png', bytes: new Uint8Array(PNG), size: PNG.length, sha256: 'a'.repeat(64) }],
      ['newLogo', { id: 'newLogo', mime: 'image/png', bytes: new Uint8Array(PNG), size: PNG.length, sha256: 'b'.repeat(64) }],
    ]);
    db.row = { id: 'c1', data, organizationId: 'default', brandingSnapshot: null };
  });

  it('shows the snapshot (name, contact, colour, logo asset) even after a rebrand', async () => {
    const frozen = {
      ...getBranding({ BRAND_NAME: 'Firma Veche SRL', BRAND_PHONE: '+40 111', BRAND_PRIMARY_COLOR: '#ff0000' }),
      logoAssetId: 'oldLogo',
      logoSha256: 'a'.repeat(64),
    };
    db.row = { ...db.row, brandingSnapshot: JSON.parse(JSON.stringify(brandingSnapshot(frozen))) };

    const quote = await buildQuotePdfForToken('AbCdEf123456', 'http://localhost');
    expect(quote).not.toBeNull();
    const { model, assets } = db.rendered[0];
    expect(model.company.name).toBe('Firma Veche SRL');
    expect(model.company.contact).toEqual(['+40 111']);
    expect(model.company.colors.primary).toBe('#ff0000');
    expect(assets.logo).toMatchObject({ format: 'png' });
  });

  it('uses the current branding for a quote saved before snapshots existed', async () => {
    await buildQuotePdfForToken('AbCdEf123456', 'http://localhost');
    const { model } = db.rendered[0];
    expect(model.company.name).toBe('Firma Nouă');
    expect(model.company.contact).toEqual(['Strada Nouă 1']);
    expect(model.company.colors.primary).toBe('#0000ff');
  });

  it('prints the company name when the snapshotted logo asset no longer exists', async () => {
    const frozen = { ...getBranding({ BRAND_NAME: 'Firma Veche SRL' }), logoAssetId: 'gone', logoSha256: 'c'.repeat(64) };
    db.row = { ...db.row, brandingSnapshot: JSON.parse(JSON.stringify(brandingSnapshot(frozen))) };
    await buildQuotePdfForToken('AbCdEf123456', 'http://localhost');
    expect(db.rendered[0].assets.logo).toBeNull();
    expect(db.rendered[0].model.company.name).toBe('Firma Veche SRL');
  });
});
