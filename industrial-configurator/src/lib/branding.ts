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
 */
import { HEX_PATTERN } from './colors';

export interface Branding {
  name: string;
  /** Logo file relative to public/ (PNG or JPEG), or null. */
  logoPath: string | null;
  colors: { primary: string; text: string; muted: string; line: string };
  address: string;
  phone: string;
  email: string;
  website: string;
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
