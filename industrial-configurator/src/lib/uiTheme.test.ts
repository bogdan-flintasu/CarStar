import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UI_THEME,
  UI_THEME_PRESETS,
  contrastRatio,
  normalizeUiTheme,
  readableTextOn,
  uiThemeStyle,
} from './uiTheme';
import { uiThemeSchema } from './validation/uiTheme';

describe('UI theme', () => {
  it('normalises missing and invalid fields to the default', () => {
    expect(normalizeUiTheme(null)).toEqual(DEFAULT_UI_THEME);
    const t = normalizeUiTheme({ accent: '#1D4ED8', text: 'red', radius: 'huge', sky: 'yes' });
    expect(t.accent).toBe('#1d4ed8');
    expect(t.text).toBe(DEFAULT_UI_THEME.text);
    expect(t.radius).toBe(DEFAULT_UI_THEME.radius);
    expect(t.sky).toBe(DEFAULT_UI_THEME.sky);
  });

  it('writes the CSS variables, with corner radii scaled', () => {
    const style = uiThemeStyle({ ...DEFAULT_UI_THEME, radius: 'none' });
    expect(style['--ui-accent']).toBe(DEFAULT_UI_THEME.accent);
    expect(style['--ui-bar-bg']).toBe(DEFAULT_UI_THEME.barBackground);
    expect(style['--radius-xl']).toBe('0rem');
    expect(uiThemeStyle({ ...DEFAULT_UI_THEME, radius: 'large' })['--radius-xl']).toBe('1.125rem');
  });

  it('computes WCAG contrast and picks readable text', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(readableTextOn('#f5a623')).toBe('#111111');
    expect(readableTextOn('#1d4ed8')).toBe('#ffffff');
  });

  it('every preset is valid and readable', () => {
    for (const { theme } of UI_THEME_PRESETS) {
      expect(uiThemeSchema.safeParse(theme).success).toBe(true);
      expect(contrastRatio(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.accentText, theme.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.barText, theme.barBackground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rejects unknown fields and bad colours', () => {
    expect(uiThemeSchema.safeParse({ ...DEFAULT_UI_THEME, extra: 1 }).success).toBe(false);
    expect(uiThemeSchema.safeParse({ ...DEFAULT_UI_THEME, accent: '#fff' }).success).toBe(false);
  });
});
