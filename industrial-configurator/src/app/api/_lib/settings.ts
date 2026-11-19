import prisma from '@/lib/prisma';
import { normalizeUiTheme, UI_THEME_COLOR_FIELDS, type UiTheme } from '@/lib/uiTheme';
import { brandLogoUrl, getActiveBranding } from '@/lib/branding';
import type { BrandForm } from '@/lib/validation/brand';
import { DEFAULT_ORGANIZATION_ID, deleteAssetIfUnused } from './assetStore';

/** Legacy home of the interface theme (before brand identity). Still read as a fallback, never deleted. */
const UI_THEME_KEY = 'uiTheme';

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A stored theme that has at least one colour (the migration copies `{}` when there was no setting). */
const hasTheme = (v: unknown): v is Record<string, unknown> => isObject(v) && UI_THEME_COLOR_FIELDS.some((f) => f in v);

/**
 * Makes sure the default organization and its brand identity exist (the migration creates them; this covers a database
 * that was restored from before it). Idempotent.
 */
export async function ensureDefaultOrganization(): Promise<void> {
  const legacy = await prisma.appSetting.findUnique({ where: { key: UI_THEME_KEY } });
  await prisma.organization.upsert({
    where: { id: DEFAULT_ORGANIZATION_ID },
    create: { id: DEFAULT_ORGANIZATION_ID, name: '' },
    update: {},
  });
  await prisma.brandIdentity.upsert({
    where: { organizationId: DEFAULT_ORGANIZATION_ID },
    create: { id: DEFAULT_ORGANIZATION_ID, organizationId: DEFAULT_ORGANIZATION_ID, theme: hasTheme(legacy?.value) ? { ...legacy.value } : {} },
    update: {},
  });
}

/**
 * The configurator's interface theme: the default organization's BrandIdentity.theme, else the legacy AppSetting row,
 * else the default. A database error or bad JSON also gives the default: the configurator must always render.
 */
export async function getUiTheme(): Promise<UiTheme> {
  try {
    const brand = await prisma.brandIdentity.findUnique({ where: { organizationId: DEFAULT_ORGANIZATION_ID }, select: { theme: true } });
    if (hasTheme(brand?.theme)) return normalizeUiTheme(brand.theme);
    const legacy = await prisma.appSetting.findUnique({ where: { key: UI_THEME_KEY } });
    return normalizeUiTheme(hasTheme(legacy?.value) ? legacy.value : null);
  } catch (error) {
    console.error('Failed to read the UI theme:', error);
    return normalizeUiTheme(null);
  }
}

export async function saveUiTheme(theme: UiTheme): Promise<UiTheme> {
  await ensureDefaultOrganization();
  const value = { ...theme };
  await prisma.brandIdentity.update({ where: { organizationId: DEFAULT_ORGANIZATION_ID }, data: { theme: value } });
  return getUiTheme();
}

// ─── Brand identity (company details, colours, logo) ─────────────────────────

export interface BrandSettings extends BrandForm {
  /** Versioned public URL of the uploaded logo, or null. */
  logoUrl: string | null;
  logoMime: string | null;
  /** The name the app shows now (display name, organization name, environment). */
  effectiveName: string;
}

export async function getBrandSettings(): Promise<BrandSettings> {
  await ensureDefaultOrganization();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: DEFAULT_ORGANIZATION_ID }, include: { brand: true } });
  const branding = await getActiveBranding();
  const logo = org.brand?.logoAssetId
    ? await prisma.asset.findUnique({ where: { id: org.brand.logoAssetId }, select: { mime: true } })
    : null;
  return {
    displayName: org.brand?.displayName ?? '',
    legalName: org.legalName,
    taxId: org.taxId,
    regNo: org.regNo,
    address: org.address,
    phone: org.phone,
    email: org.email,
    website: org.website,
    primaryColor: org.brand?.primaryColor ?? '',
    secondaryColor: org.brand?.secondaryColor ?? null,
    logoUrl: logo ? brandLogoUrl(branding) : null,
    logoMime: logo?.mime ?? null,
    effectiveName: branding.name,
  };
}

export async function saveBrandForm(form: BrandForm): Promise<BrandSettings> {
  await ensureDefaultOrganization();
  await prisma.organization.update({
    where: { id: DEFAULT_ORGANIZATION_ID },
    data: {
      legalName: form.legalName,
      taxId: form.taxId,
      regNo: form.regNo,
      address: form.address,
      phone: form.phone,
      email: form.email,
      website: form.website,
    },
  });
  await prisma.brandIdentity.update({
    where: { organizationId: DEFAULT_ORGANIZATION_ID },
    data: { displayName: form.displayName, primaryColor: form.primaryColor, secondaryColor: form.secondaryColor || null },
  });
  return getBrandSettings();
}

/** Points the brand at a stored logo asset and drops the previous one unless a saved quote still shows it. */
export async function setBrandLogo(assetId: string | null): Promise<BrandSettings> {
  await ensureDefaultOrganization();
  const before = await prisma.brandIdentity.findUnique({ where: { organizationId: DEFAULT_ORGANIZATION_ID }, select: { logoAssetId: true } });
  await prisma.brandIdentity.update({ where: { organizationId: DEFAULT_ORGANIZATION_ID }, data: { logoAssetId: assetId } });
  if (before?.logoAssetId && before.logoAssetId !== assetId) await deleteAssetIfUnused(before.logoAssetId);
  return getBrandSettings();
}
