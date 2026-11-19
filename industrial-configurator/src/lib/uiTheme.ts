/**
 * Colours and shape of the configurator's interface ("tema interfeței"), set by the admin.
 *
 * How it is applied: the configurator is wrapped in `.cfg-theme` with the CSS variables of `uiThemeStyle()`.
 * globals.css maps them onto Tailwind's own colour variables inside that wrapper (white → surface, black → text, the gray
 * ramp mixed between the two, the accent, the corner radii), so the existing components follow the theme without
 * their class names changing. The footer bar has its own pair of colours (`.cfg-bar`).
 */
import { HEX_PATTERN } from './colors';

export const UI_RADII = ['none', 'small', 'medium', 'large'] as const;
export type UiRadius = (typeof UI_RADII)[number];

export interface UiTheme {
  /** Buttons, active steps, sliders, highlights. */
  accent: string;
  /** Text and icons on the accent colour. */
  accentText: string;
  /** Panels, cards, header. */
  surface: string;
  /** Main text; the grays are mixed between it and `surface`. */
  text: string;
  /** Behind the panels (page background). */
  background: string;
  /** Bottom bar with the price. */
  barBackground: string;
  barText: string;
  /** Behind the hall in the 3D view, where no sky is drawn. */
  viewport: string;
  /** Draw a sky behind the hall (false: the plain `viewport` colour). */
  sky: boolean;
  radius: UiRadius;
}

export const DEFAULT_UI_THEME: UiTheme = {
  accent: '#f5a623',
  accentText: '#111111',
  surface: '#ffffff',
  text: '#111111',
  background: '#f8f9fa',
  barBackground: '#1a1a1a',
  barText: '#ffffff',
  viewport: '#dddddd',
  sky: true,
  radius: 'medium',
};

export const UI_THEME_PRESETS: { id: string; name: string; theme: UiTheme }[] = [
  { id: 'classic', name: 'Clasic', theme: DEFAULT_UI_THEME },
  {
    id: 'graphite',
    name: 'Grafit (întunecat)',
    theme: {
      accent: '#f5a623',
      accentText: '#111111',
      surface: '#1c1f24',
      text: '#eef0f3',
      background: '#121417',
      barBackground: '#0b0c0e',
      barText: '#ffffff',
      viewport: '#2a2e35',
      sky: false,
      radius: 'medium',
    },
  },
  {
    id: 'corporate',
    name: 'Albastru corporativ',
    theme: {
      accent: '#1d4ed8',
      accentText: '#ffffff',
      surface: '#ffffff',
      text: '#0f172a',
      background: '#f1f5f9',
      barBackground: '#0f172a',
      barText: '#ffffff',
      viewport: '#dbe3ec',
      sky: true,
      radius: 'small',
    },
  },
  {
    id: 'industrial',
    name: 'Industrial (verde)',
    theme: {
      accent: '#15803d',
      accentText: '#ffffff',
      surface: '#fbfaf7',
      text: '#1c1917',
      background: '#f0eee9',
      barBackground: '#1c1917',
      barText: '#fafaf9',
      viewport: '#d6d3cc',
      sky: true,
      radius: 'none',
    },
  },
  {
    id: 'signal',
    name: 'Roșu semnal',
    theme: {
      accent: '#dc2626',
      accentText: '#ffffff',
      surface: '#ffffff',
      text: '#18181b',
      background: '#f4f4f5',
      barBackground: '#ffffff',
      barText: '#18181b',
      viewport: '#e4e4e7',
      sky: false,
      radius: 'large',
    },
  },
];

export const UI_THEME_COLOR_FIELDS = [
  'accent',
  'accentText',
  'surface',
  'text',
  'background',
  'barBackground',
  'barText',
  'viewport',
] as const satisfies readonly (keyof UiTheme)[];
export type UiThemeColorField = (typeof UI_THEME_COLOR_FIELDS)[number];

export const UI_THEME_LABELS: Record<UiThemeColorField, string> = {
  accent: 'Culoare de accent',
  accentText: 'Text pe accent',
  surface: 'Panouri',
  text: 'Text',
  background: 'Fundal pagină',
  barBackground: 'Bara de preț',
  barText: 'Text bară de preț',
  viewport: 'Fundal vizualizare 3D',
};

export const UI_RADIUS_LABELS: Record<UiRadius, string> = {
  none: 'Drepte',
  small: 'Puțin rotunjite',
  medium: 'Rotunjite',
  large: 'Foarte rotunjite',
};

/** Scale applied to Tailwind's radii (--radius-*) inside the configurator. */
const RADIUS_SCALE: Record<UiRadius, number> = { none: 0, small: 0.5, medium: 1, large: 1.5 };
/** Tailwind v4's default radii, rem. */
const TAILWIND_RADII = { xs: 0.125, sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, '2xl': 1, '3xl': 1.5 } as const;

/** A theme with every missing or invalid field taken from the default, so a bad row never breaks the page. */
export function normalizeUiTheme(raw: Partial<Record<keyof UiTheme, unknown>> | null | undefined): UiTheme {
  const theme = { ...DEFAULT_UI_THEME };
  if (!raw) return theme;
  for (const field of UI_THEME_COLOR_FIELDS) {
    const v = raw[field];
    if (typeof v === 'string' && HEX_PATTERN.test(v)) theme[field] = v.toLowerCase();
  }
  if (typeof raw.sky === 'boolean') theme.sky = raw.sky;
  if (typeof raw.radius === 'string' && (UI_RADII as readonly string[]).includes(raw.radius)) theme.radius = raw.radius as UiRadius;
  return theme;
}

/** CSS variables of a theme, for the `style` of the `.cfg-theme` wrapper. */
export function uiThemeStyle(theme: UiTheme): Record<string, string> {
  const scale = RADIUS_SCALE[theme.radius];
  const style: Record<string, string> = {
    '--ui-accent': theme.accent,
    '--ui-accent-text': theme.accentText,
    '--ui-surface': theme.surface,
    '--ui-text': theme.text,
    '--ui-background': theme.background,
    '--ui-bar-bg': theme.barBackground,
    '--ui-bar-text': theme.barText,
    '--ui-viewport': theme.viewport,
  };
  for (const [name, rem] of Object.entries(TAILWIND_RADII)) style[`--radius-${name}`] = `${rem * scale}rem`;
  return style;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio of two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, '#111111') >= contrastRatio(background, '#ffffff') ? '#111111' : '#ffffff';
}

/** The pairs whose contrast the admin should keep readable (WCAG AA: 4.5 for text). */
export const UI_THEME_CONTRAST_PAIRS: { label: string; fg: UiThemeColorField; bg: UiThemeColorField }[] = [
  { label: 'Text pe panouri', fg: 'text', bg: 'surface' },
  { label: 'Text pe accent', fg: 'accentText', bg: 'accent' },
  { label: 'Text pe bara de preț', fg: 'barText', bg: 'barBackground' },
];
