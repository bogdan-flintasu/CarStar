/**
 * Interface themes generated from one or two brand colours: "Luminos", "Întunecat" and "Bară în culoarea firmei".
 * Every text/background pair of UI_THEME_CONTRAST_PAIRS meets WCAG AA (4.5:1): colours are nudged in lightness, keeping
 * their hue, until they pass (reusing the contrast helpers of uiTheme.ts).
 */
import { hexToHsl, hslToHex, withLightness } from './brandColors';
import { HEX_PATTERN } from './colors';
import { contrastRatio, normalizeUiTheme, readableTextOn, luminance, type UiTheme } from './uiTheme';

export const AA_TEXT = 4.5;

export interface GeneratedTheme {
  id: 'light' | 'dark' | 'brandBar';
  name: string;
  theme: UiTheme;
}

type Direction = 'any' | 'lighter' | 'darker';

/**
 * `bg` moved in lightness (smallest change, keeping hue and saturation) until black or white text reads on it at 4.5:1.
 * `direction` restricts the move, e.g. a dark theme's accent may only get lighter.
 */
export function fitBackground(bg: string, direction: Direction = 'any'): string {
  const ok = (c: string) => contrastRatio(c, readableTextOn(c)) >= AA_TEXT;
  if (ok(bg)) return bg;
  const { l } = hexToHsl(bg);
  for (let step = 1; step <= 100; step++) {
    const d = step / 100;
    const candidates = [
      ...(direction !== 'lighter' ? [withLightness(bg, l - d)] : []),
      ...(direction !== 'darker' ? [withLightness(bg, l + d)] : []),
    ];
    const found = candidates.find(ok);
    if (found) return found;
  }
  return luminance(bg) > 0.4 ? '#ffffff' : '#000000';
}

/** `fg` moved away from `bg` in lightness until the contrast reaches `min` (black or white at the end of the road). */
export function ensureContrast(fg: string, bg: string, min = AA_TEXT): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const sign = luminance(bg) > 0.4 ? -1 : 1;
  const { l } = hexToHsl(fg);
  for (let step = 1; step <= 100; step++) {
    const c = withLightness(fg, l + (sign * step) / 100);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return sign < 0 ? '#000000' : '#ffffff';
}

const hsl = (h: number, s: number, l: number) => hslToHex({ h, s, l });
const validHex = (v: string | undefined | null): v is string => !!v && HEX_PATTERN.test(v);

/** Saturation of tinted neutrals: a hint of the brand hue, never a colour cast. */
const tint = (primary: string) => Math.min(0.25, hexToHsl(primary).s * 0.4);

function finish(theme: UiTheme): UiTheme {
  return normalizeUiTheme(theme);
}

/** A bar (price bar) colour pair: the bar and the readable text on it. */
function barPair(bar: string): { barBackground: string; barText: string } {
  const barBackground = fitBackground(bar);
  return { barBackground, barText: readableTextOn(barBackground) };
}

function lightTheme(primary: string, secondary: string): UiTheme {
  const hue = hexToHsl(primary).h;
  const t = tint(primary);
  const accent = fitBackground(primary);
  const surface = '#ffffff';
  const bar = hexToHsl(secondary);
  return finish({
    accent,
    accentText: readableTextOn(accent),
    surface,
    text: ensureContrast(hsl(hue, t, 0.1), surface),
    background: hsl(hue, t * 0.8, 0.965),
    ...barPair(hsl(bar.h, Math.min(0.35, bar.s), 0.12)),
    viewport: hsl(hue, t * 0.5, 0.86),
    sky: true,
    radius: 'medium',
  });
}

function darkTheme(primary: string, secondary: string): UiTheme {
  const hue = hexToHsl(primary).h;
  const t = tint(primary);
  const surface = hsl(hue, t * 0.7, 0.13);
  // On a dark panel the accent must stand out: lighten it first, then make sure its own text reads.
  const accent = fitBackground(ensureContrast(primary, surface, 3), 'lighter');
  const bar = hexToHsl(secondary);
  return finish({
    accent,
    accentText: readableTextOn(accent),
    surface,
    text: ensureContrast(hsl(hue, t * 0.4, 0.94), surface),
    background: hsl(hue, t * 0.7, 0.08),
    ...barPair(hsl(bar.h, Math.min(0.3, bar.s), 0.06)),
    viewport: hsl(hue, t * 0.6, 0.2),
    sky: false,
    radius: 'medium',
  });
}

function brandBarTheme(primary: string): UiTheme {
  const hue = hexToHsl(primary).h;
  const t = tint(primary);
  const surface = '#ffffff';
  // Buttons in a darker shade of the brand colour, so they stay apart from the bar that wears the colour itself.
  const accent = fitBackground(withLightness(primary, Math.max(0, hexToHsl(primary).l - 0.12)), 'darker');
  return finish({
    accent,
    accentText: readableTextOn(accent),
    surface,
    text: ensureContrast(hsl(hue, t, 0.1), surface),
    background: hsl(hue, t * 0.8, 0.965),
    ...barPair(primary),
    viewport: hsl(hue, t * 0.5, 0.86),
    sky: true,
    radius: 'medium',
  });
}

/**
 * The three themes for a brand: `primary` is the main colour, `secondary` (optional) tints the price bar of the plain
 * variants. Invalid colours fall back to a neutral blue-grey so the function never throws.
 */
export function generateThemes(primary: string, secondary?: string | null): GeneratedTheme[] {
  const main = validHex(primary) ? primary.toLowerCase() : '#374151';
  const second = validHex(secondary) ? secondary.toLowerCase() : main;
  return [
    { id: 'light', name: 'Luminos', theme: lightTheme(main, second) },
    { id: 'dark', name: 'Întunecat', theme: darkTheme(main, second) },
    { id: 'brandBar', name: 'Bară în culoarea firmei', theme: brandBarTheme(main) },
  ];
}
