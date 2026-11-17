/**
 * Cladding textures, generated from the sheet profiles instead of photos.
 *
 * Painted steel cladding is one flat colour; what makes it read as cladding is its profile (ribs, joints). So each
 * texture is a 1D cross-section turned into:
 *   - a normal map (the profile's slope), which does the shading, and
 *   - a light grey occlusion map (darker in the valleys and joints), used as `map`.
 * Neither carries a colour: the material's `color` is the customer's colour, unchanged.
 *
 * One tile is one metre (the walls' and roof's UVs are in metres). The profile runs along U (ribs run along V) or
 * along V (ribs run along U).
 */
import { DataTexture, LinearMipmapLinearFilter, LinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three';

/** Pixels per tile (= per metre) along the profile. */
const RESOLUTION = 1024;
/** Pixels across the profile: the texture is constant that way, so a few rows are enough. */
const ROWS = 4;

/** Height (metres, outwards) and occlusion (0 = black, 1 = none) at a position across the profile (metres, 0..1). */
export type Profile = (x: number) => { height: number; occlusion: number };

/** Piecewise-linear height through `points` ([x, height] in millimetres, x ascending over one period). */
function linear(points: readonly (readonly [number, number])[], x: number): number {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return points[points.length - 1][1];
}

const smooth = (edge: number, x: number) => Math.max(0, Math.min(1, x / edge));

/**
 * Single-skin trapezoidal sheet (T40-class), ribs running up the wall: 4 ribs per metre, 40 mm deep, a wide flat
 * crest and a narrow valley with a stiffening groove. Valleys are shaded a little.
 */
export const SHEET_PROFILE: Profile = (x) => {
  const mm = (x * 1000) % 250;
  // Crest 0-105, web down to 130, valley 130-225 with a 6 mm groove at 175, web back up to 250.
  const height = linear(
    [
      [0, 40], [105, 40], [130, 0], [168, 0], [172, -3], [178, -3], [182, 0], [225, 0], [250, 40],
    ],
    mm,
  );
  return { height: height / 1000, occlusion: 0.86 + 0.14 * (height / 40) };
};

/**
 * Sandwich wall panel laid horizontally, 1 m modules: a flat skin with fine micro-lining every 50 mm and a dark
 * shadow-line joint between panels.
 */
export const WALL_PANEL_PROFILE: Profile = (x) => {
  const mm = (x * 1000) % 1000;
  // Joint: a 14 mm V groove, 8 mm deep, centred on the panel edge (0 / 1000).
  const fromJoint = Math.min(mm, 1000 - mm);
  if (fromJoint < 7) {
    const depth = 8 * (1 - fromJoint / 7);
    return { height: -depth / 1000, occlusion: 0.45 + 0.4 * (fromJoint / 7) };
  }
  // Micro-lining: shallow 1 mm rounded grooves, 8 mm wide.
  const inLine = mm % 50;
  const groove = Math.max(0, 1 - Math.abs(inLine - 25) / 4);
  const depth = 0.8 * Math.sin((groove * Math.PI) / 2);
  return { height: -depth / 1000, occlusion: 1 - 0.05 * groove * smooth(1, fromJoint - 7) };
};

/**
 * Roof panel (sandwich or single skin, they look the same from above): 4 high, narrow ribs per metre running down
 * the slope, with two shallow stiffening lines in each pan.
 */
export const ROOF_PROFILE: Profile = (x) => {
  const mm = (x * 1000) % 250;
  // Rib 0-60 (crest 20-40, 38 mm high), pan 60-250 with lines at 125 and 185.
  const rib = linear([[0, 0], [20, 38], [40, 38], [60, 0], [250, 0]], mm);
  const line = (at: number) => Math.max(0, 1 - Math.abs(mm - at) / 3) * 1.5;
  const height = rib + line(125) + line(185);
  return { height: height / 1000, occlusion: rib > 0 ? 0.9 + 0.1 * (rib / 38) : 0.93 };
};

export interface ProfileMaps {
  map: DataTexture;
  normalMap: DataTexture;
}

/** How strongly the profile's slope bends the normals. 1 = true to the geometry. */
const NORMAL_STRENGTH = 1;

/**
 * Builds the maps of a profile. `axis` is the texture axis the profile varies along.
 * Normals follow the three.js (OpenGL, +V up) convention.
 */
export function profileMaps(profile: Profile, axis: 'u' | 'v'): ProfileMaps {
  const step = 1 / RESOLUTION;
  const samples = Array.from({ length: RESOLUTION }, (_, i) => profile((i + 0.5) * step));

  const width = axis === 'u' ? RESOLUTION : ROWS;
  const height = axis === 'u' ? ROWS : RESOLUTION;
  const color = new Uint8Array(width * height * 4);
  const normal = new Uint8Array(width * height * 4);

  for (let i = 0; i < RESOLUTION; i++) {
    const before = samples[(i - 1 + RESOLUTION) % RESOLUTION].height;
    const after = samples[(i + 1) % RESOLUTION].height;
    const slope = ((after - before) / (2 * step)) * NORMAL_STRENGTH;
    const length = Math.hypot(slope, 1);
    const along = -slope / length; // component along the profile axis
    const up = 1 / length;
    const nx = axis === 'u' ? along : 0;
    const ny = axis === 'v' ? along : 0;
    const shade = Math.round(255 * Math.max(0, Math.min(1, samples[i].occlusion)));

    for (let r = 0; r < ROWS; r++) {
      const pixel = axis === 'u' ? r * width + i : i * width + r;
      color.set([shade, shade, shade, 255], pixel * 4);
      normal.set([Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((up * 0.5 + 0.5) * 255), 255], pixel * 4);
    }
  }

  const texture = (data: Uint8Array, srgb: boolean) => {
    const t = new DataTexture(data, width, height, RGBAFormat);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: texture(color, true), normalMap: texture(normal, false) };
}
