/**
 * Who the quotes and lead emails come from. One place for the company's name, logo, colours and contact details,
 * read from the environment with neutral defaults, so the same app can be deployed for another company
 * (first step toward white-labelling). Server-side: read it in API routes, not in client components.
 *
 *   BRAND_NAME           company name                      (default "Configurator hale")
 *   BRAND_LOGO           PNG/JPEG path inside public/      (default none: the name is shown instead)
 *   BRAND_PRIMARY_COLOR  #rrggbb accent colour             (default #F5A623)
 *   BRAND_TEXT_COLOR     #rrggbb text/heading colour       (default #1A1A1A)
 *   BRAND_ADDRESS, BRAND_PHONE, BRAND_EMAIL, BRAND_WEBSITE  contact lines (default empty: not shown)
 *
 * `getBranding(env)` is that environment-only, synchronous reading. `getActiveBranding()` is what the app uses: the
 * default organization's brand identity from the database (name, logo, colours, contact details set in the admin),
 * with the environment filling in whatever is missing, and as a whole when the database cannot be read.
 */
import { HEX_PATTERN } from './colors';
import { brandingSnapshotSchema, type BrandingSnapshot } from './validation/brand';

export interface Branding {
  name: string;
  /** Logo file relative to public/ (PNG or JPEG), or null. */
  logoPath: string | null;
  colors: { primary: string; text: string; muted: string; line: string };
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Uploaded logo (an Asset of the organization), when there is one. It wins over `logoPath`. */
  logoAssetId?: string | null;
  logoSha256?: string | null;
  logoMime?: string | null;
  organizationId?: string | null;
}

export const DEFAULT_BRANDING: Branding = {
  name: 'Configurator hale',
  logoPath: null,
  colors: { primary: '#F5A623', text: '#1A1A1A', muted: '#6B7280', line: '#E5E7EB' },
  address: '',
  phone: '',
  email: '',
  website: '',
};

/** A safe relative path to a PNG/JPEG under public/: no "..", no absolute path, no URL. */
const LOGO_PATTERN = /^(?!.*\.\.)[A-Za-z0-9_\-/]+\.(png|jpe?g)$/i;

type Env = Record<string, string | undefined>;

const text = (value: string | undefined, max = 200) => (value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const color = (value: string | undefined, fallback: string) => {
  const v = text(value);
  return HEX_PATTERN.test(v) ? v : fallback;
};

export function getBranding(env: Env = process.env): Branding {
  const logo = text(env.BRAND_LOGO).replace(/^\/+/, '');
  const d = DEFAULT_BRANDING;
  return {
    name: text(env.BRAND_NAME, 120) || d.name,
    logoPath: LOGO_PATTERN.test(logo) ? logo : null,
    colors: {
      ...d.colors,
      primary: color(env.BRAND_PRIMARY_COLOR, d.colors.primary),
      text: color(env.BRAND_TEXT_COLOR, d.colors.text),
    },
    address: text(env.BRAND_ADDRESS),
    phone: text(env.BRAND_PHONE, 60),
    email: text(env.BRAND_EMAIL, 254),
    website: text(env.BRAND_WEBSITE),
  };
}

/** Non-empty contact lines, in display order. */
export function contactLines(branding: Branding): string[] {
  return [branding.address, branding.phone, branding.email, branding.website].filter(Boolean);
}

/** Public URL of the uploaded logo, versioned by its hash so a new logo shows at once; null without an uploaded logo. */
export function brandLogoUrl(branding: Pick<Branding, 'logoAssetId' | 'logoSha256'>): string | null {
  return branding.logoAssetId && branding.logoSha256 ? `/api/brand/logo?v=${branding.logoSha256.slice(0, 8)}` : null;
}

const DEFAULT_ORGANIZATION_ID = 'default';

/**
 * The branding the app shows now: the default organization's brand identity from the database over the environment
 * (name: display name, then organization name, then BRAND_NAME). Never throws: any database problem gives the
 * environment branding, so pages and quotes always render.
 */
export async function getActiveBranding(env: Env = process.env): Promise<Branding> {
  const base = getBranding(env);
  try {
    const { default: prisma } = await import('./prisma');
    const org = await prisma.organization.findUnique({ where: { id: DEFAULT_ORGANIZATION_ID }, include: { brand: true } });
    if (!org) return base;
    const brand = org.brand;
    let logo: { id: string; sha256: string; mime: string } | null = null;
    if (brand?.logoAssetId) {
      const asset = await prisma.asset.findUnique({ where: { id: brand.logoAssetId }, select: { id: true, sha256: true, mime: true } });
      if (asset) logo = { id: asset.id, sha256: asset.sha256, mime: asset.mime };
    }
    return {
      ...base,
      name: text(brand?.displayName, 120) || text(org.name, 120) || base.name,
      logoAssetId: logo?.id ?? null,
      logoSha256: logo?.sha256 ?? null,
      logoMime: logo?.mime ?? null,
      organizationId: org.id,
      colors: { ...base.colors, primary: color(brand?.primaryColor, base.colors.primary) },
      address: text(org.address) || base.address,
      phone: text(org.phone, 60) || base.phone,
      email: text(org.email, 254) || base.email,
      website: text(org.website) || base.website,
    };
  } catch (error) {
    console.error('Failed to read the brand identity, using the environment:', error);
    return base;
  }
}

/** What is frozen into a saved quote: everything its PDF shows about the company. */
export function brandingSnapshot(branding: Branding): BrandingSnapshot {
  return {
    v: 1,
    name: branding.name,
    address: branding.address,
    phone: branding.phone,
    email: branding.email,
    website: branding.website,
    colors: branding.colors,
    logoAssetId: branding.logoAssetId ?? null,
    logoSha256: branding.logoSha256 ?? null,
    logoPath: branding.logoPath,
  };
}

/** The branding of a stored snapshot, or null when the value is missing or not a valid snapshot (old rows). */
export function brandingFromSnapshot(value: unknown, organizationId?: string | null): Branding | null {
  const parsed = brandingSnapshotSchema.safeParse(value);
  if (!parsed.success) return null;
  const s = parsed.data;
  return {
    name: s.name || DEFAULT_BRANDING.name,
    logoPath: s.logoPath && LOGO_PATTERN.test(s.logoPath) ? s.logoPath : null,
    colors: s.colors,
    address: s.address,
    phone: s.phone,
    email: s.email,
    website: s.website,
    logoAssetId: s.logoAssetId,
    logoSha256: s.logoSha256,
    organizationId: organizationId ?? null,
  };
}
