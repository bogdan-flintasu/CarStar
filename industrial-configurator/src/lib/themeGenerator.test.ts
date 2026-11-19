import { describe, expect, it } from 'vitest';
import { generateThemes } from './themeGenerator';
import { UI_THEME_CONTRAST_PAIRS, contrastRatio, type UiTheme } from './uiTheme';
import { uiThemeSchema } from './validation/uiTheme';

const BRANDS: Array<[string, string, string?]> = [
  ['yellow', '#ffd400'],
  ['very dark', '#0a0a0a'],
  ['very dark blue + grey', '#0b1020', '#374151'],
  ['white', '#ffffff'],
  ['mid green', '#2e9e4f', '#f5a623'],
  ['mid orange', '#e8761a'],
  ['mid blue', '#3b82f6', '#1e3a8a'],
  ['red', '#dc2626'],
  ['grey', '#808080'],
  ['teal', '#14b8a6'],
];

const pairsPass = (t: UiTheme) => UI_THEME_CONTRAST_PAIRS.every(({ fg, bg }) => contrastRatio(t[fg], t[bg]) >= 4.5);

describe('generateThemes', () => {
  it('makes the three named variants', () => {
    expect(generateThemes('#1d4ed8').map((t) => t.name)).toEqual(['Luminos', 'Întunecat', 'Bară în culoarea firmei']);
  });

  for (const [label, primary, secondary] of BRANDS) {
    it(`every text/background pair meets WCAG AA for ${label} (${primary})`, () => {
      for (const { name, theme } of generateThemes(primary, secondary)) {
        for (const { label: pair, fg, bg } of UI_THEME_CONTRAST_PAIRS) {
          expect(contrastRatio(theme[fg], theme[bg]), `${name}: ${pair}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(uiThemeSchema.safeParse(theme).success, `${name} is a valid UiTheme`).toBe(true);
      }
    });
  }

  it('fills the price bar with the brand colour in the brand-bar variant, buttons darker', () => {
    const brandBar = generateThemes('#1d4ed8')[2].theme;
    expect(brandBar.barBackground).toBe('#1d4ed8');
    expect(brandBar.accent).not.toBe(brandBar.barBackground);
    expect(pairsPass(brandBar)).toBe(true);
  });

  it('keeps the brand colour as the accent when it already reads', () => {
    expect(generateThemes('#dc2626')[0].theme.accent).toBe('#dc2626');
  });

  it('survives invalid colours', () => {
    expect(generateThemes('not-a-colour', 'nope').every((t) => pairsPass(t.theme))).toBe(true);
  });
});
