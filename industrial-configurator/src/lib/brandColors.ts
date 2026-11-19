/**
 * Brand colours: colour maths (hex <-> HSL) and the extraction of a logo's dominant colours.
 * `extractPalette` is a pure function over RGBA pixels (unit-tested); `paletteFromImageUrl` is the browser wrapper that
 * draws an image on a canvas and feeds it.
 */

export interface PaletteColor {
  hex: string;
  /** Share of the counted (non-skipped) pixels, 0..1. */
  share: number;
}

export interface Hsl {
  /** 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  l: number;
}

/** A neutral second colour for a one-colour logo. */
export const NEUTRAL_SECOND_COLOR = '#374151';

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const toHexByte = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: clamp(s), l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * clamp(l) - 1)) * clamp(s);
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = clamp(l) - c / 2;
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

/** The colour with its lightness (and optionally saturation) replaced. */
export function withLightness(hex: string, l: number, s?: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ h: hsl.h, s: s ?? hsl.s, l: clamp(l) });
}

const channelDistance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Near white, near black or transparent pixels are the logo's background, not its colours. */
function isBackgroundPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 128) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (min >= 235) return true; // near white
  if (max <= 32) return true; // near black
  return false;
}

/**
 * The 1-`maxColors` dominant colours of an image, most prominent first. `pixels` is a flat RGBA array (canvas
 * `ImageData.data`). Skips transparent, near-white and near-black pixels; merges similar shades; chromatic colours rank
 * above greys of the same size. An image with nothing left gives an empty list.
 */
export function extractPalette(pixels: ArrayLike<number>, maxColors = 5): PaletteColor[] {
  // 3 bits per channel: 8 levels each, 512 buckets.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let counted = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (isBackgroundPixel(r, g, b, pixels[i + 3])) continue;
    counted++;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  if (counted === 0) return [];

  const candidates = [...buckets.values()]
    .map((bk) => {
      const rgb = [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n] as const;
      const hex = rgbToHex(...rgb);
      // A grey counts for less than a colour of the same size: logos are rarely "the grey".
      const weight = bk.n * (0.4 + hexToHsl(hex).s);
      return { rgb, hex, n: bk.n, weight };
    })
    .filter((c) => c.n / counted >= 0.01)
    .sort((a, b) => b.weight - a.weight);

  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length >= maxColors) break;
    if (chosen.some((o) => channelDistance(o.rgb, c.rgb) < 70)) continue;
    chosen.push(c);
  }
  // Shares: of the pixels that fall near each chosen colour (close shades were merged into it).
  const merged = new Map<string, number>();
  for (const c of candidates) {
    const owner = chosen.reduce((best, o) => (channelDistance(o.rgb, c.rgb) < channelDistance(best.rgb, c.rgb) ? o : best));
    if (channelDistance(owner.rgb, c.rgb) < 70) merged.set(owner.hex, (merged.get(owner.hex) ?? 0) + c.n);
  }
  return chosen.map((c) => ({ hex: c.hex, share: (merged.get(c.hex) ?? c.n) / counted }));
}

/** Hue distance on the colour wheel, 0..180. */
function hueDistance(a: string, b: string): number {
  const d = Math.abs(hexToHsl(a).h - hexToHsl(b).h);
  return Math.min(d, 360 - d);
}

/**
 * The main and second colour suggested by a palette. The second is the most prominent colour that clearly differs
 * from the first; a one-colour logo gets a neutral dark grey.
 */
export function suggestBrandColors(palette: readonly PaletteColor[]): { primary: string; secondary: string } | null {
  if (palette.length === 0) return null;
  const primary = palette[0].hex;
  const second = palette.slice(1).find((c) => channelDistance(hexToRgb(c.hex), hexToRgb(primary)) > 90 || hueDistance(c.hex, primary) > 30);
  return { primary, secondary: second?.hex ?? NEUTRAL_SECOND_COLOR };
}

/** Browser only: draws the image on a small canvas and extracts its palette. Rejects when it cannot be read. */
export function paletteFromImageUrl(url: string, maxColors = 5): Promise<PaletteColor[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 128 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || 128) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || 128) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(extractPalette(ctx.getImageData(0, 0, w, h).data, maxColors));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('The logo could not be decoded'));
    img.src = url;
  });
}
