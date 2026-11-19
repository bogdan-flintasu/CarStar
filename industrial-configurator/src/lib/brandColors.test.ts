import { describe, expect, it } from 'vitest';
import { extractPalette, hexToHsl, hslToHex, NEUTRAL_SECOND_COLOR, suggestBrandColors } from './brandColors';

/** RGBA pixels: `[r, g, b, a, count]` groups, flattened. */
function pixels(...groups: Array<[number, number, number, number, number]>): number[] {
  return groups.flatMap(([r, g, b, a, n]) => Array.from({ length: n }, () => [r, g, b, a]).flat());
}

describe('extractPalette', () => {
  it('finds the dominant colours of a multi-colour logo, biggest first', () => {
    const palette = extractPalette(
      pixels([220, 30, 40, 255, 600], [20, 80, 200, 255, 300], [250, 200, 20, 255, 100], [255, 255, 255, 255, 2000]),
    );
    expect(palette.map((c) => c.hex)).toEqual(['#dc1e28', '#1450c8', '#fac814']);
    expect(palette[0].share).toBeCloseTo(0.6, 1);
  });

  it('gives one colour for a one-colour logo and merges its shades', () => {
    const palette = extractPalette(pixels([220, 30, 40, 255, 500], [224, 34, 44, 255, 300], [255, 255, 255, 255, 800]));
    expect(palette).toHaveLength(1);
    expect(suggestBrandColors(palette)?.secondary).toBe(NEUTRAL_SECOND_COLOR);
  });

  it('skips near-white, near-black and transparent pixels', () => {
    expect(extractPalette(pixels([255, 255, 255, 255, 900], [250, 250, 250, 255, 50], [5, 5, 5, 255, 50]))).toEqual([]);
    expect(extractPalette(pixels([200, 20, 20, 0, 1000]))).toEqual([]);
    expect(extractPalette([])).toEqual([]);
  });

  it('caps the number of colours', () => {
    const many = pixels(
      [200, 20, 20, 255, 100],
      [20, 200, 20, 255, 100],
      [20, 20, 200, 255, 100],
      [200, 200, 20, 255, 100],
      [200, 20, 200, 255, 100],
      [20, 200, 200, 255, 100],
    );
    expect(extractPalette(many, 5)).toHaveLength(5);
    expect(extractPalette(many, 3)).toHaveLength(3);
  });

  it('ignores crumbs below 1% of the logo', () => {
    const palette = extractPalette(pixels([200, 20, 20, 255, 990], [20, 20, 200, 255, 5]));
    expect(palette.map((c) => c.hex)).toEqual(['#c81414']);
  });
});

describe('suggestBrandColors', () => {
  it('takes the first colour as main and the first clearly different one as second', () => {
    const s = suggestBrandColors([
      { hex: '#dc1e28', share: 0.5 },
      { hex: '#e02a30', share: 0.3 },
      { hex: '#1450c8', share: 0.2 },
    ]);
    expect(s).toEqual({ primary: '#dc1e28', secondary: '#1450c8' });
    expect(suggestBrandColors([])).toBeNull();
  });
});

describe('colour maths', () => {
  it('round-trips hex through HSL', () => {
    for (const hex of ['#f5a623', '#1d4ed8', '#808080', '#000000', '#ffffff']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  });
});
