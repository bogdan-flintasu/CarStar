/**
 * Section cut of the 3D hall (T3d), pure maths: no three.js objects, no React.
 *
 *   - `transversal` cuts across the width (a plane square to Z): it shows the portal frame. The front part (z > cut) is
 *     cut away, so the default camera (in front, on the left) looks into the hall.
 *   - `longitudinal` cuts along the length (a plane square to X): the left part (x < cut) is cut away.
 *
 * The cut's position is kept as a fraction of the hall's extent along the cut axis (0 = one end, 1 = the other), so it
 * stays in the hall when the hall is resized; 0.5 (mid-span) by default.
 * Plane convention is three.js's: a point p is kept when `normal · p + constant >= 0`, cut away otherwise.
 */
import { faceHeightAt, type HallLayout, type LegacyWallId, type Vec2, type Vec3, type WallDescriptor } from '@/lib/hall';
import { computeWallHoles } from '@/components/3d/openings/wallShapeWithHoles';
import { ALL_LAYERS_VISIBLE, type LayerVisibility } from './layers';

export const SECTION_MODES = ['off', 'transversal', 'longitudinal'] as const;
export type SectionMode = (typeof SECTION_MODES)[number];
export type SectionAxis = 'x' | 'z';

export const SECTION_LABELS: Record<SectionMode, string> = {
  off: 'Oprită',
  transversal: 'Transversală',
  longitudinal: 'Longitudinală',
};

/** Default position: mid-span. */
export const DEFAULT_SECTION_FRACTION = 0.5;
/** The cut never sits exactly on the hall's outer faces (it would cut nothing, or flicker on them). */
const EDGE_INSET = 0.01;
/** Points this close to the plane count as kept (a hit on the cut face itself). */
const CLIP_EPSILON = 1e-4;

/** The hall's extent along each cut axis: steel, cladding and roof (layout.bounds). */
export interface SectionExtents {
  x: readonly [number, number];
  z: readonly [number, number];
}

export interface SectionPlane {
  axis: SectionAxis;
  /** World coordinate of the cut along `axis`. */
  coordinate: number;
  normal: Vec3;
  constant: number;
}

export const sectionAxis = (mode: Exclude<SectionMode, 'off'>): SectionAxis => (mode === 'transversal' ? 'z' : 'x');

export function sectionExtents(layout: Pick<HallLayout, 'bounds'>): SectionExtents {
  const { min, max } = layout.bounds;
  return { x: [min[0], max[0]], z: [min[2], max[2]] };
}

export const clampFraction = (t: number) => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : DEFAULT_SECTION_FRACTION);

/** The usable range of the cut along an axis: the extent, inset a centimetre at each end. */
export function sectionRange(axis: SectionAxis, extents: SectionExtents): readonly [number, number] {
  const [a, b] = extents[axis];
  const inset = Math.min(EDGE_INSET, (b - a) / 4);
  return [a + inset, b - inset];
}

/** World coordinate of the cut for a fraction of the range (clamped). */
export function sectionCoordinate(axis: SectionAxis, t: number, extents: SectionExtents): number {
  const [a, b] = sectionRange(axis, extents);
  return a + clampFraction(t) * (b - a);
}

/** The fraction for a world coordinate (clamped to the range): the inverse of `sectionCoordinate`. */
export function sectionFraction(axis: SectionAxis, coordinate: number, extents: SectionExtents): number {
  const [a, b] = sectionRange(axis, extents);
  return b > a ? clampFraction((coordinate - a) / (b - a)) : DEFAULT_SECTION_FRACTION;
}

/** The clipping plane for a mode and position, or null when the section is off. */
export function sectionPlane(mode: SectionMode, t: number, extents: SectionExtents): SectionPlane | null {
  if (mode === 'off') return null;
  const axis = sectionAxis(mode);
  const coordinate = sectionCoordinate(axis, t, extents);
  // Transversal keeps z <= cut; longitudinal keeps x >= cut.
  return axis === 'z'
    ? { axis, coordinate, normal: [0, 0, -1], constant: coordinate }
    : { axis, coordinate, normal: [1, 0, 0], constant: -coordinate };
}

export type SectionPoint = Vec3 | { x: number; y: number; z: number };

/** True when the point is on the cut-away side of the plane (never with no plane). */
export function isClipped(point: SectionPoint, plane: Pick<SectionPlane, 'normal' | 'constant'> | null): boolean {
  if (!plane) return false;
  const [x, y, z] = 'x' in point ? [point.x, point.y, point.z] : point;
  const [nx, ny, nz] = plane.normal;
  return nx * x + ny * y + nz * z + plane.constant < -CLIP_EPSILON;
}

/**
 * Where a pointer ray passes closest to a line parallel to the cut axis (through `through`): the coordinate along the
 * axis, used to drag the cut. Null when the ray runs (almost) along the axis.
 */
export function closestOnAxis(origin: Vec3, direction: Vec3, axis: SectionAxis, through: Vec3): number | null {
  const e: Vec3 = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  const w = [origin[0] - through[0], origin[1] - through[1], origin[2] - through[2]];
  const dot = (p: readonly number[], q: readonly number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const a = dot(direction, direction);
  const b = dot(direction, e);
  const d = dot(direction, w);
  const f = dot(e, w);
  const denominator = a - b * b; // e·e = 1
  if (a === 0 || denominator / a < 1e-6) return null;
  const t = (a * f - b * d) / denominator;
  return (axis === 'x' ? through[0] : through[2]) + t;
}

// ---------------------------------------------------------------------------------------------------------------
// Caps: the cut faces of the cladding, roof and slab, filled.

/** An opening cut out of a wall (Walls.tsx's WallHole). */
export interface SectionHole {
  wallId: LegacyWallId;
  offsetX: number;
  sill: number;
  width: number;
  height: number;
}

/**
 * One filled face of the cut, in the plane's own 2D frame: `u` is world X on a transversal cut, world Z on a
 * longitudinal one; `y` is world Y. Counter-clockwise or not, it is a simple polygon.
 */
export type CapPolygon = readonly Vec2[];

const rect = (u0: number, u1: number, y0: number, y1: number): CapPolygon => [
  [Math.min(u0, u1), y0],
  [Math.max(u0, u1), y0],
  [Math.max(u0, u1), y1],
  [Math.min(u0, u1), y1],
];

/** [from, to] minus every interval in `cuts` (all in the same units). */
export function subtractIntervals(from: number, to: number, cuts: readonly (readonly [number, number])[]): [number, number][] {
  let pieces: [number, number][] = to > from ? [[from, to]] : [];
  for (const [c0, c1] of cuts) {
    pieces = pieces.flatMap(([a, b]): [number, number][] => {
      if (c1 <= a || c0 >= b) return [[a, b]];
      const out: [number, number][] = [];
      if (c0 > a) out.push([a, c0]);
      if (c1 < b) out.push([c1, b]);
      return out;
    });
  }
  return pieces;
}

const AXIS_INDEX = { x: 0, z: 2 } as const;

/** A wall crossed by the cut (its length runs along the cut axis): the cut face of the panel, minus its openings. */
function wallCap(wall: WallDescriptor, axis: SectionAxis, coordinate: number, holes: readonly SectionHole[]): CapPolygon[] {
  const i = AXIS_INDEX[axis];
  if (Math.abs(wall.axisH[i]) < 0.5) return []; // parallel to the cut: not crossed
  const h = (coordinate - wall.origin[i]) / wall.axisH[i];
  if (!(h > 0 && h < wall.spanH)) return [];
  const across = axis === 'z' ? 0 : 2; // the plane's u axis
  const face = wall.origin[across];
  const inner = face - wall.normal[across] * wall.thickness;
  const top = faceHeightAt(wall, h);
  const own = computeWallHoles(wall, holes.filter((hole) => hole.wallId === wall.id));
  const cuts = own.filter((r) => h > r.h0 && h < r.h1).map((r) => [r.v0, r.v1] as const);
  const y0 = wall.origin[1];
  return subtractIntervals(0, top, cuts).map(([v0, v1]) => rect(face, inner, y0 + v0, y0 + v1));
}

/** The roof panel cut by the plane. */
function roofCaps(layout: HallLayout, axis: SectionAxis, coordinate: number): CapPolygon[] {
  const planes = layout.roof;
  const first = planes[0];
  if (axis === 'z') {
    if (!(coordinate > first.zBack && coordinate < first.zFront)) return [];
    // The extruded cross-section of Roof.tsx: underside, then the top surface back.
    const underside = planes.length === 1 ? [first.eave, first.ridge] : [planes[0].eave, planes[0].ridge, planes[1].eave];
    const up = first.plumbThickness;
    return [[...underside, ...[...underside].reverse().map(([x, y]) => [x, y + up] as const)]];
  }
  const caps: CapPolygon[] = [];
  planes.forEach((plane, index) => {
    const [ex, ey] = plane.eave;
    const [rx, ry] = plane.ridge;
    const lo = Math.min(ex, rx);
    const hi = Math.max(ex, rx);
    // A cut right on the ridge (mid-span on a gable, the default) is capped once, by the first slope.
    const inside = (coordinate > lo && coordinate < hi) || (index === 0 && Math.abs(coordinate - rx) < 1e-9);
    if (!inside || hi === lo) return;
    const y = ey + ((coordinate - ex) / (rx - ex)) * (ry - ey);
    caps.push(rect(plane.zBack, plane.zFront, y, y + plane.plumbThickness));
  });
  return caps;
}

function slabCap(layout: HallLayout, axis: SectionAxis, coordinate: number): CapPolygon[] {
  const { w, l, centerX, centerZ, topY, thickness } = layout.slab;
  const [c0, c1] = axis === 'z' ? [centerZ - l / 2, centerZ + l / 2] : [centerX - w / 2, centerX + w / 2];
  if (!(coordinate > c0 && coordinate < c1)) return [];
  const [u0, u1] = axis === 'z' ? [centerX - w / 2, centerX + w / 2] : [centerZ - l / 2, centerZ + l / 2];
  return [rect(u0, u1, topY - thickness, topY)];
}

export interface SectionCapOptions {
  holes?: readonly SectionHole[];
  layers?: LayerVisibility;
  /** Walls, roof and rainwater are drawn (step 1 can hide them). */
  claddingVisible?: boolean;
}

/**
 * The faces to fill at the cut: the wall panels it crosses (minus their openings), the roof panel and the slab, each
 * only when its layer is shown. Steel members are not capped (thin sections; their cut shows the member's inside).
 */
export function sectionCaps(layout: HallLayout, plane: Pick<SectionPlane, 'axis' | 'coordinate'>, options: SectionCapOptions = {}): CapPolygon[] {
  const { holes = [], layers = ALL_LAYERS_VISIBLE, claddingVisible = true } = options;
  const { axis, coordinate } = plane;
  const caps: CapPolygon[] = [];
  if (claddingVisible && layers.walls) {
    for (const wall of Object.values(layout.walls)) caps.push(...wallCap(wall, axis, coordinate, holes));
  }
  if (claddingVisible && layers.roof) caps.push(...roofCaps(layout, axis, coordinate));
  if (layout.params.foundation && layers.foundation) caps.push(...slabCap(layout, axis, coordinate));
  return caps;
}
