import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  fail: false,
  org: null as Record<string, unknown> | null,
  asset: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    organization: {
      findUnique: async () => {
        if (db.fail) throw new Error('database is down');
        return db.org;
      },
    },
    asset: { findUnique: async () => db.asset },
  },
}));

const { brandLogoUrl, brandingFromSnapshot, brandingSnapshot, getActiveBranding, getBranding, DEFAULT_BRANDING } = await import('./branding');

const emptyOrg = { id: 'default', name: '', address: '', phone: '', email: '', website: '', brand: null };

describe('getActiveBranding', () => {
  beforeEach(() => {
    db.fail = false;
    db.org = null;
    db.asset = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('falls back to the environment when the database has nothing', async () => {
    const env = { BRAND_NAME: 'Din mediu SRL', BRAND_PHONE: '+40 1' };
    expect(await getActiveBranding(env)).toEqual(getBranding(env));
    expect(await getActiveBranding({})).toEqual(DEFAULT_BRANDING);
  });

  it('falls back to the environment when the database fails', async () => {
    db.fail = true;
    expect(await getActiveBranding({ BRAND_NAME: 'Din mediu SRL' })).toEqual(getBranding({ BRAND_NAME: 'Din mediu SRL' }));
  });

  it('uses the organization and brand identity over the environment, field by field', async () => {
    db.org = {
      ...emptyOrg,
      name: 'Numele organizației',
      phone: '+40 700 000 000',
      brand: { displayName: '', logoAssetId: null, primaryColor: '#dc2626' },
    };
    const b = await getActiveBranding({ BRAND_NAME: 'Din mediu SRL', BRAND_EMAIL: 'env@x.ro', BRAND_PRIMARY_COLOR: '#112233' });
    expect(b.name).toBe('Numele organizației');
    expect(b.phone).toBe('+40 700 000 000');
    expect(b.email).toBe('env@x.ro'); // not set in the database: the environment fills in
    expect(b.colors.primary).toBe('#dc2626');
    expect(b.organizationId).toBe('default');
  });

  it('prefers the display name, then the organization name, then the environment', async () => {
    db.org = { ...emptyOrg, name: 'Org', brand: { displayName: 'Marca', logoAssetId: null, primaryColor: '' } };
    expect((await getActiveBranding({ BRAND_NAME: 'Env' })).name).toBe('Marca');
    db.org = { ...emptyOrg, name: 'Org', brand: { displayName: '', logoAssetId: null, primaryColor: '' } };
    expect((await getActiveBranding({ BRAND_NAME: 'Env' })).name).toBe('Org');
    db.org = { ...emptyOrg, brand: { displayName: '', logoAssetId: null, primaryColor: '' } };
    expect((await getActiveBranding({ BRAND_NAME: 'Env' })).name).toBe('Env');
    expect((await getActiveBranding({})).name).toBe(DEFAULT_BRANDING.name);
  });

  it('knows the uploaded logo and builds a versioned URL', async () => {
    db.org = { ...emptyOrg, brand: { displayName: 'A', logoAssetId: 'asset1', primaryColor: '' } };
    db.asset = { id: 'asset1', sha256: 'abcdef0123456789', mime: 'image/png' };
    const b = await getActiveBranding({});
    expect(b.logoAssetId).toBe('asset1');
    expect(brandLogoUrl(b)).toBe('/api/brand/logo?v=abcdef01');
    expect(brandLogoUrl(getBranding({}))).toBeNull();
  });
});

describe('branding snapshot', () => {
  it('round-trips and rejects junk (old rows have none)', () => {
    const branding = { ...getBranding({ BRAND_NAME: 'Firma', BRAND_LOGO: 'brand/logo.png' }), logoAssetId: 'a1', logoSha256: 'f'.repeat(64) };
    const restored = brandingFromSnapshot(JSON.parse(JSON.stringify(brandingSnapshot(branding))), 'org1');
    expect(restored).toMatchObject({ name: 'Firma', logoPath: 'brand/logo.png', logoAssetId: 'a1', organizationId: 'org1' });
    expect(restored?.colors).toEqual({ primary: '#f5a623', text: '#1a1a1a', muted: '#6b7280', line: '#e5e7eb' }); // lowercased
    expect(brandingFromSnapshot(null)).toBeNull();
    expect(brandingFromSnapshot({ v: 1, name: 5 })).toBeNull();
  });
});
