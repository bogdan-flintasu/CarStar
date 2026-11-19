/**
 * The hall as 2D drawings: four elevations, the plan and a cross-section, built from the HallLayout (+ openings).
 * Format-neutral and serialisable (numbers, strings, arrays only), so the same model feeds the dimension chains on
 * the orthographic 3D views, the vector elevations of the PDF quote and a DXF export. Pure, no three.js.
 *
 * Every drawing lives in its own sheet frame: x to the right, y up, metres, rounded to the millimetre.
 * `toWorld` maps a sheet point back: world = origin + x * axisX + y * axisY. Geometry is made in world coordinates
 * and projected with the same frame, so a drawing and its 3D view always agree.
 *
 * Heights dimensioned (the same two as DimensionLines.tsx):
 *   - `H`: the clear height at the (low) eave, `params.height` (floor to the rafter's underside at the inner column face);
 *   - `Coamă` / `H max`: top of steel at the ridge of a gable or at the high eave of a mono-pitch roof, `layout.ridgeY`.
 */
import { COLUMN_DEPTH, FRAME_FLANGE_WIDTH, PURLIN_SIZE, RAFTER_DEPTH, ROOF_PITCH_DEG } from './constants';
import { formatMetres, formatNumber, formatSize, roundMm } from './drawingsFormat';
import type { HallColumn, HallLayout, LegacyWallId, Vec2, Vec3, WallDescriptor, WallKey } from './types';
import { wallPointToWorld } from './walls';

export { formatMetres, formatNumber, formatSize, roundMm } from './drawingsFormat';

// ── Model ─────────────────────────────────────────────────────────────────────

export const DRAWING_VIEWS = ['front', 'back', 'left', 'right', 'plan', 'section'] as const;
export type DrawingViewId = (typeof DRAWING_VIEWS)[number];
export type ElevationViewId = Extract<DrawingViewId, WallKey>;

export type DrawingLayer = 'outline' | 'steel' | 'cladding' | 'roof' | 'openings' | 'foundation' | 'grid' | 'dimensions';

/** Structural opening input, compatible with the openings store (current and next shape). */
export interface DrawingOpening {
  id: string;
  type: 'window' | 'door' | 'garageDoor';
  wallId: LegacyWallId;
  /** Metres from the wall start along the wall's `h` axis to the opening's edge nearest the start. */
  offsetX: number;
  /** Floor to the bottom edge. */
  sill: number;
  width: number;
  height: number;
}

export interface DrawingFrame {
  origin: Vec3;
  axisX: Vec3;
  axisY: Vec3;
}

export interface DrawingPolyline {
  layer: DrawingLayer;
  points: Vec2[];
  closed: boolean;
  /** What it draws, e.g. `wall`, `column:left:0`, `opening:<id>`. */
  ref?: string;
}

/**
 * A grid axis: a straight line `direction` runs along (`'y'`: vertical, at x = `at`; `'x'`: horizontal, at y = `at`),
 * from `from` to `to` on that direction. `labelAt` is where the axis bubble goes (past the `to` or `from` end).
 */
export interface DrawingAxis {
  label: string;
  at: number;
  direction: 'x' | 'y';
  from: number;
  to: number;
  labelAt: Vec2;
}

export interface DimensionSegment {
  from: number;
  to: number;
  /** to - from, in metres (mm). */
  value: number;
  text: string;
  /** Middle of the segment on the dimension line. */
  labelAt: Vec2;
}

/**
 * A chain of dimensions measured along `direction` (`'x'`: horizontal chain; `'y'`: vertical chain).
 * Extension lines run perpendicular to it, from `base` (the measured feature) to `line` (the dimension line); both
 * are coordinates on the other axis. `row` counts outwards from the drawing (0 = nearest). `points` are ordered
 * ascending; segment i spans points[i] → points[i + 1].
 */
export interface DimensionChain {
  id: string;
  direction: 'x' | 'y';
  base: number;
  line: number;
  row: number;
  points: number[];
  segments: DimensionSegment[];
}

export interface DrawingLabel {
  text: string;
  at: Vec2;
  layer: DrawingLayer;
  ref?: string;
}

export interface Drawing {
  view: DrawingViewId;
  title: string;
  toWorld: DrawingFrame;
  bounds: { min: Vec2; max: Vec2 };
  polylines: DrawingPolyline[];
  axes: DrawingAxis[];
  dimensions: DimensionChain[];
  labels: DrawingLabel[];
}

export const DRAWING_TITLES: Record<DrawingViewId, string> = {
  front: 'Fațadă față',
  back: 'Fațadă spate',
  left: 'Fațadă stânga',
  right: 'Fațadă dreapta',
  plan: 'Plan',
  section: 'Secțiune transversală',
};

/** Distance from the drawing to the first dimension row, and between rows (sheet metres). */
export const DIMENSION_FIRST_OFFSET = 1;
export const DIMENSION_ROW_GAP = 0.8;
/** How far grid axes run past the outline, and their bubble past the line's end. */
export const AXIS_OVERRUN = 1;
export const AXIS_LABEL_GAP = 0.5;
/** A window's sill dimension stands this far left of the opening. */
export const SILL_DIMENSION_GAP = 0.3;

// ── Small vector helpers ──────────────────────────────────────────────────────

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg = (a: Vec3): Vec3 => [0 - a[0] || 0, 0 - a[1] || 0, 0 - a[2] || 0];

/** Sheet point (x, y) of a drawing → world point. */
export function drawingPointToWorld(frame: DrawingFrame, [x, y]: Vec2): Vec3 {
  const { origin: o, axisX: ax, axisY: ay } = frame;
  return [o[0] + x * ax[0] + y * ay[0], o[1] + x * ax[1] + y * ay[1], o[2] + x * ax[2] + y * ay[2]];
}

/** World point → sheet point (the depth along the view direction is dropped). */
export function worldToDrawing(frame: DrawingFrame, p: Vec3): Vec2 {
  const d = sub(p, frame.origin);
  return [roundMm(dot(d, frame.axisX)), roundMm(dot(d, frame.axisY))];
}

const roundFrame = (frame: DrawingFrame): DrawingFrame => ({
  origin: frame.origin.map(roundMm) as unknown as Vec3,
  axisX: frame.axisX.map(roundMm) as unknown as Vec3,
  axisY: frame.axisY.map(roundMm) as unknown as Vec3,
});

/** Convex hull (monotone chain), counter-clockwise, duplicates removed: the silhouette of a projected solid. */
function convexHull(points: readonly Vec2[]): Vec2[] {
  const unique = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) return unique;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Vec2[]) => {
    const out: Vec2[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(unique), ...half([...unique].reverse())];
}

/** The 8 corners of an axis-aligned box. */
function boxCorners(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

const AXIS_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Shared world geometry ─────────────────────────────────────────────────────

/** Column solid (its axis-aligned box): depth across X, flange width along Z. */
function columnBox(c: HallColumn): Vec3[] {
  return boxCorners(
    [c.x - COLUMN_DEPTH / 2, c.baseY, c.z - FRAME_FLANGE_WIDTH / 2],
    [c.x + COLUMN_DEPTH / 2, c.topY, c.z + FRAME_FLANGE_WIDTH / 2],
  );
}

/** A wall's cladding solid: its face polygon on the outer face and on the inner face. */
function wallSolid(wall: WallDescriptor): Vec3[] {
  return wall.polygon.flatMap(([h, v]) => [wallPointToWorld(wall, h, v), wallPointToWorld(wall, h, v, -wall.thickness)]);
}

/** Each roof plane as a solid: its profile (underside + top, in XY) swept from the front to the back edge. */
function roofSolids(layout: HallLayout): Vec3[][] {
  return layout.roof.map((plane) => {
    const profile: Vec2[] = [
      plane.eave,
      plane.ridge,
      [plane.ridge[0], plane.ridge[1] + plane.plumbThickness],
      [plane.eave[0], plane.eave[1] + plane.plumbThickness],
    ];
    return profile.flatMap(([x, y]) => [
      [x, y, plane.zFront] as Vec3,
      [x, y, plane.zBack] as Vec3,
    ]);
  });
}

function slabSolid(layout: HallLayout): Vec3[] {
  const s = layout.slab;
  return boxCorners(
    [s.centerX - s.w / 2, s.topY - s.thickness, s.centerZ - s.l / 2],
    [s.centerX + s.w / 2, s.topY, s.centerZ + s.l / 2],
  );
}

/** The rectangle an opening cuts in its wall, on the outer face (and through the cladding for the plan). */
function openingSolid(wall: WallDescriptor, o: DrawingOpening, throughWall: boolean): Vec3[] {
  const corners: Vec2[] = [
    [o.offsetX, o.sill],
    [o.offsetX + o.width, o.sill],
    [o.offsetX + o.width, o.sill + o.height],
    [o.offsetX, o.sill + o.height],
  ];
  return corners.flatMap(([h, v]) =>
    throughWall ? [wallPointToWorld(wall, h, v), wallPointToWorld(wall, h, v, -wall.thickness)] : [wallPointToWorld(wall, h, v)],
  );
}

const axisLabelOfSide = (side: 'left' | 'right') => (side === 'left' ? AXIS_LETTERS[0] : AXIS_LETTERS[1]);
const topLabel = (layout: HallLayout) => (layout.roofType === 'mono' ? 'H max' : 'Coamă');

// ── Drawing builder ───────────────────────────────────────────────────────────

class Sheet {
  readonly polylines: DrawingPolyline[] = [];
  readonly axes: DrawingAxis[] = [];
  readonly dimensions: DimensionChain[] = [];
  readonly labels: DrawingLabel[] = [];

  constructor(readonly frame: DrawingFrame) {}

  project = (p: Vec3): Vec2 => worldToDrawing(this.frame, p);

  /** A polygon/line given in world coordinates, projected as is. */
  line(layer: DrawingLayer, world: readonly Vec3[], closed: boolean, ref?: string) {
    this.polylines.push({ layer, points: world.map(this.project), closed, ...(ref ? { ref } : {}) });
  }

  /** The silhouette of a solid (its projected convex hull). */
  solid(layer: DrawingLayer, world: readonly Vec3[], ref?: string) {
    const points = convexHull(world.map(this.project));
    if (points.length >= 2) this.polylines.push({ layer, points, closed: points.length > 2, ...(ref ? { ref } : {}) });
  }

  /** Extent of the polylines drawn so far, optionally only some layers. */
  extent(layers?: readonly DrawingLayer[]) {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const pl of this.polylines) {
      if (layers && !layers.includes(pl.layer)) continue;
      for (const [x, y] of pl.points) {
        [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
      }
    }
    return { minX, minY, maxX, maxY };
  }

  /** A grid axis through sheet coordinate `at`, running along `direction` from `from` to `to`; bubble at `bubbleEnd`. */
  axis(label: string, direction: 'x' | 'y', at: number, from: number, to: number, bubbleEnd: 'from' | 'to') {
    const [lo, hi] = [roundMm(Math.min(from, to)), roundMm(Math.max(from, to))];
    const along = bubbleEnd === 'to' ? hi + AXIS_LABEL_GAP : lo - AXIS_LABEL_GAP;
    const c = roundMm(at);
    this.axes.push({
      label,
      at: c,
      direction,
      from: lo,
      to: hi,
      labelAt: direction === 'y' ? [c, roundMm(along)] : [roundMm(along), c],
    });
    const ends: Vec2[] = direction === 'y' ? [[c, lo], [c, hi]] : [[lo, c], [hi, c]];
    this.polylines.push({ layer: 'grid', points: ends, closed: false, ref: `axis:${label}` });
  }

  /**
   * A dimension chain through the sorted, de-duplicated `points`. `line` is the dimension line's coordinate;
   * `text(value, i)` labels segment i (defaults to the formatted length).
   */
  chain(
    id: string,
    direction: 'x' | 'y',
    rawPoints: readonly number[],
    base: number,
    line: number,
    row: number,
    text: (value: number, index: number) => string = formatMetres,
  ) {
    const points = [...new Set(rawPoints.map(roundMm))].sort((a, b) => a - b);
    if (points.length < 2) return;
    const l = roundMm(line);
    const segments = points.slice(1).map((to, i) => {
      const from = points[i];
      const value = roundMm(to - from);
      const mid = roundMm((from + to) / 2);
      return { from, to, value, text: text(value, i), labelAt: (direction === 'x' ? [mid, l] : [l, mid]) as Vec2 };
    });
    this.dimensions.push({ id, direction, base: roundMm(base), line: l, row, points, segments });
  }

  label(text: string, at: Vec2, layer: DrawingLayer, ref?: string) {
    this.labels.push({ text, at: [roundMm(at[0]), roundMm(at[1])], layer, ...(ref ? { ref } : {}) });
  }

  finish(view: DrawingViewId): Drawing {
    const xs: number[] = [];
    const ys: number[] = [];
    const add = ([x, y]: Vec2) => (xs.push(x), ys.push(y));
    for (const pl of this.polylines) pl.points.forEach(add);
    for (const a of this.axes) add(a.labelAt);
    for (const d of this.dimensions) {
      for (const p of d.points) {
        add(d.direction === 'x' ? [p, d.line] : [d.line, p]);
        add(d.direction === 'x' ? [p, d.base] : [d.base, p]);
      }
    }
    for (const l of this.labels) add(l.at);
    return {
      view,
      title: DRAWING_TITLES[view],
      toWorld: roundFrame(this.frame),
      bounds: { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] },
      polylines: this.polylines,
      axes: this.axes,
      dimensions: this.dimensions,
      labels: this.labels,
    };
  }
}

/** Rows of a chain below (`'x'` chains, y = min - offset) or right of (`'y'` chains) the given extent. */
const rowLine = (edge: number, row: number, outwards: 1 | -1) =>
  edge + outwards * (DIMENSION_FIRST_OFFSET + row * DIMENSION_ROW_GAP);

/** H (clear height at the low eave) and the ridge / high eave (top of steel), as vertical chains right of the drawing. */
function heightChains(sheet: Sheet, layout: HallLayout, floorY: number) {
  const { maxX } = sheet.extent();
  sheet.chain('eave', 'y', [floorY, floorY + layout.params.height], maxX, rowLine(maxX, 0, 1), 0, (v) => `H = ${formatMetres(v)}`);
  sheet.chain('top', 'y', [floorY, floorY + layout.ridgeY], maxX, rowLine(maxX, 1, 1), 1, (v) => `${topLabel(layout)} = ${formatMetres(v)}`);
}

// ── Elevations ────────────────────────────────────────────────────────────────

/**
 * Sheet frame of an elevation, as seen from outside: x to the viewer's right, y up, (0, 0) at the bottom of the wall
 * face's left end. The left wall's `h` runs right to left from outside, so its frame starts at the far end of `h`.
 */
export function elevationFrame(wall: WallDescriptor): DrawingFrame {
  if (wall.key === 'left') {
    return { origin: wallPointToWorld(wall, wall.spanH, 0), axisX: neg(wall.axisH), axisY: wall.axisV };
  }
  return { origin: wall.origin, axisX: wall.axisH, axisY: wall.axisV };
}

function buildElevation(layout: HallLayout, key: ElevationViewId, openings: readonly DrawingOpening[]): Drawing {
  const wall = layout.walls[key];
  const sheet = new Sheet(elevationFrame(wall));
  const isEnd = key === 'front' || key === 'back';

  if (layout.params.foundation) sheet.solid('foundation', slabSolid(layout), 'slab');
  // Columns behind the wall: the end frame's two (end walls) or every frame's column on that side (side walls).
  const endFrame = key === 'front' ? 0 : layout.frames.length - 1;
  const columns = layout.columns.filter((c) => (isEnd ? c.frame === endFrame : c.side === key));
  for (const c of columns) sheet.solid('steel', columnBox(c), `column:${c.side}:${c.frame}`);
  // Side elevations see the end walls edge on.
  if (!isEnd) {
    sheet.solid('cladding', wallSolid(layout.walls.front), 'wall:front');
    sheet.solid('cladding', wallSolid(layout.walls.back), 'wall:back');
  }
  roofSolids(layout).forEach((solid, i) => sheet.solid('roof', solid, `roof:${layout.roof[i].side}`));
  sheet.line('outline', wall.polygon.map(([h, v]) => wallPointToWorld(wall, h, v)), true, 'wall');

  // Openings on this wall.
  const own = openings.filter((o) => o.wallId === wall.id);
  const edges: number[] = [];
  for (const o of own) {
    const rect = openingSolid(wall, o, false).map(sheet.project);
    sheet.polylines.push({ layer: 'openings', points: rect, closed: true, ref: `opening:${o.id}` });
    const xs = rect.map((p) => p[0]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    edges.push(x0, x1);
    sheet.label(formatSize(o.width, o.height), [(x0 + x1) / 2, o.sill + o.height / 2], 'openings', `opening:${o.id}`);
    if (o.sill > 0) {
      sheet.chain(`sill:${o.id}`, 'y', [0, o.sill], x0, x0 - SILL_DIMENSION_GAP, 0);
    }
  }

  // Grid axes behind the wall: A / B on the end walls, the frame numbers on the side walls.
  const wallTop = Math.max(...wall.polygon.map(([, v]) => v));
  const axisTop = Math.max(wallTop, layout.bounds.max[1]) + AXIS_OVERRUN;
  const axisColumns = isEnd ? columns : columns.slice().sort((a, b) => a.frame - b.frame);
  for (const c of axisColumns) {
    const [x] = sheet.project([c.x, 0, c.z]);
    sheet.axis(isEnd ? axisLabelOfSide(c.side) : String(c.frame + 1), 'y', x, 0, axisTop, 'to');
  }

  // Horizontal chains below everything: openings (when any), bays (axis to axis), total.
  const { minY } = sheet.extent();
  const axisXs = axisColumns.map((c) => sheet.project([c.x, 0, c.z])[0]);
  let row = 0;
  if (own.length > 0) {
    sheet.chain('openings', 'x', [0, ...edges, wall.spanH], 0, rowLine(minY, row, -1), row);
    row += 1;
  }
  sheet.chain('bays', 'x', axisXs, 0, rowLine(minY, row, -1), row);
  row += 1;
  if (isEnd) sheet.chain('total', 'x', [0, wall.spanH], 0, rowLine(minY, row, -1), row);
  else sheet.chain('total', 'x', [Math.min(...axisXs), Math.max(...axisXs)], 0, rowLine(minY, row, -1), row, (v) => `L = ${formatMetres(v)}`);

  heightChains(sheet, layout, 0);
  return sheet.finish(key);
}

// ── Plan ──────────────────────────────────────────────────────────────────────

/** Plan seen from above with the front at the bottom: x = world X, y = -world Z (front frame at y = 0), z ignored. */
export const PLAN_FRAME: DrawingFrame = { origin: [0, 0, 0], axisX: [1, 0, 0], axisY: [0, 0, -1] };

function buildPlan(layout: HallLayout, openings: readonly DrawingOpening[]): Drawing {
  const sheet = new Sheet(PLAN_FRAME);
  const { halfWidths, walls } = layout;
  if (layout.params.foundation) sheet.solid('foundation', slabSolid(layout), 'slab');
  roofSolids(layout).forEach((solid, i) => sheet.solid('roof', solid, `roof:${layout.roof[i].side}`));
  for (const key of ['front', 'back', 'left', 'right'] as const) sheet.solid('cladding', wallSolid(walls[key]), `wall:${key}`);
  const frontZ = walls.front.origin[2];
  const backZ = walls.back.origin[2];
  const w = halfWidths.wallOuter;
  sheet.line('outline', [[-w, 0, frontZ], [w, 0, frontZ], [w, 0, backZ], [-w, 0, backZ]], true, 'outline');
  for (const c of layout.columns) sheet.solid('steel', columnBox(c), `column:${c.side}:${c.frame}`);
  for (const o of openings) {
    const wall = Object.values(walls).find((x) => x.id === o.wallId);
    if (wall) sheet.solid('openings', openingSolid(wall, o, true), `opening:${o.id}`);
  }

  // Grid: lettered column lines across the width (A at the left), numbered frames along the length (1 at the front).
  const yFront = -frontZ - AXIS_OVERRUN;
  const yBack = -backZ + AXIS_OVERRUN;
  const xLeft = -w - AXIS_OVERRUN;
  const xRight = w + AXIS_OVERRUN;
  for (const side of ['left', 'right'] as const) {
    sheet.axis(axisLabelOfSide(side), 'y', (side === 'left' ? -1 : 1) * halfWidths.columnAxis, yFront, yBack, 'to');
  }
  for (const f of layout.frames) sheet.axis(String(f.index + 1), 'x', -f.z, xLeft, xRight, 'from');

  // Along the length, right of the drawing: bays, then the total (axis to axis).
  const { maxX, minY } = sheet.extent();
  const frameYs = layout.frames.map((f) => -f.z);
  sheet.chain('bays', 'y', frameYs, w, rowLine(maxX, 0, 1), 0);
  sheet.chain('total', 'y', [frameYs[0], frameYs[frameYs.length - 1]], w, rowLine(maxX, 1, 1), 1, (v) => `L = ${formatMetres(v)}`);
  // Across the width, below: axis to axis, then outer.
  const a = halfWidths.columnAxis;
  sheet.chain('axes', 'x', [-a, a], -frontZ, rowLine(minY, 0, -1), 0);
  sheet.chain('outer', 'x', [-w, w], -frontZ, rowLine(minY, 1, -1), 1);
  return sheet.finish('plan');
}

// ── Cross-section ─────────────────────────────────────────────────────────────

/** The frame the section cuts: the first interior frame, or the front one of a single-bay hall. */
export function sectionFrameIndex(layout: HallLayout): number {
  return layout.frames.length > 2 ? 1 : 0;
}

/** Section looking at the back of the hall (from the front): x = world X, y = world Y, through the frame's plane. */
export function sectionFrame(layout: HallLayout): DrawingFrame {
  return { origin: [0, 0, layout.frames[sectionFrameIndex(layout)].z], axisX: [1, 0, 0], axisY: [0, 1, 0] };
}

function buildSection(layout: HallLayout): Drawing {
  const sheet = new Sheet(sectionFrame(layout));
  const frameIndex = sectionFrameIndex(layout);
  const z = layout.frames[frameIndex].z;
  const { halfWidths } = layout;
  const plumbDepth = RAFTER_DEPTH / Math.cos(layout.pitch);
  const at = (x: number, y: number): Vec3 => [x, y, z];

  if (layout.params.foundation) sheet.solid('foundation', slabSolid(layout), 'slab');
  sheet.solid('cladding', wallSolid(layout.walls.left), 'wall:left');
  sheet.solid('cladding', wallSolid(layout.walls.right), 'wall:right');
  roofSolids(layout).forEach((solid, i) => sheet.solid('roof', solid, `roof:${layout.roof[i].side}`));

  const columns = layout.columns.filter((c) => c.frame === frameIndex);
  const rafters = layout.rafters.filter((r) => r.frame === frameIndex);
  for (const c of columns) sheet.solid('steel', columnBox(c), `column:${c.side}:${c.frame}`);
  for (const r of rafters) {
    const [f, t] = [r.from, r.to];
    sheet.line('steel', [at(f[0], f[1]), at(t[0], t[1]), at(t[0], t[1] + plumbDepth), at(f[0], f[1] + plumbDepth)], true, `rafter:${r.side}`);
  }
  // Eave joints: from the top of each column up to the rafter's top flange, over the column's depth.
  for (const c of columns) {
    const sign = c.side === 'left' ? -1 : 1;
    const inner = sign * halfWidths.columnInner;
    const outer = sign * halfWidths.columnOuter;
    const rafter = rafters.find((r) => Math.abs(r.from[0] - inner) < 1e-6 || Math.abs(r.to[0] - inner) < 1e-6);
    if (!rafter) continue;
    const k = (rafter.to[1] - rafter.from[1]) / (rafter.to[0] - rafter.from[0]);
    const atInner = Math.abs(rafter.from[0] - inner) < 1e-6 ? rafter.from[1] : rafter.to[1];
    const topAt = (x: number) => atInner + plumbDepth + k * (x - inner);
    sheet.line('steel', [at(inner, c.topY), at(outer, c.topY), at(outer, topAt(outer)), at(inner, topAt(inner))], true, `haunch:${c.side}`);
  }
  // Purlins: squares seated on the rafters' top flange, square to the slope.
  for (const p of layout.purlins) {
    const plane = layout.roof.find((pl) => p.x >= Math.min(pl.eave[0], pl.ridge[0]) - 1e-6 && p.x <= Math.max(pl.eave[0], pl.ridge[0]) + 1e-6);
    if (!plane) continue;
    const dx = plane.ridge[0] - plane.eave[0];
    const dy = plane.ridge[1] - plane.eave[1];
    const len = Math.hypot(dx, dy);
    const t: Vec2 = [dx / len, dy / len];
    const n: Vec2 = t[0] >= 0 ? [-t[1], t[0]] : [t[1], -t[0]];
    const s = PURLIN_SIZE;
    const corner = (a: number, b: number) => at(p.x + t[0] * a + n[0] * b, p.y + t[1] * a + n[1] * b);
    sheet.line('steel', [corner(-s / 2, 0), corner(s / 2, 0), corner(s / 2, s), corner(-s / 2, s)], true, `purlin:${p.side}:${p.index}`);
  }

  const top = layout.bounds.max[1] + AXIS_OVERRUN;
  for (const c of columns) sheet.axis(axisLabelOfSide(c.side), 'y', c.x, 0, top, 'to');

  // Below: clear width, axis to axis, outer.
  const { minY } = sheet.extent();
  const { columnInner: ci, columnAxis: ca, wallOuter: wo } = halfWidths;
  sheet.chain('clear', 'x', [-ci, ci], 0, rowLine(minY, 0, -1), 0, (v) => `l = ${formatMetres(v)}`);
  sheet.chain('axes', 'x', [-ca, ca], 0, rowLine(minY, 1, -1), 1);
  sheet.chain('outer', 'x', [-wo, wo], 0, rowLine(minY, 2, -1), 2);
  heightChains(sheet, layout, 0);

  // Roof pitch, written over the first slope.
  const plane = layout.roof[0];
  sheet.label(
    `Pantă ${formatNumber(ROOF_PITCH_DEG)}°`,
    sheet.project(at((plane.eave[0] + plane.ridge[0]) / 2, (plane.eave[1] + plane.ridge[1]) / 2 + plane.plumbThickness + 0.5)),
    'roof',
  );
  return sheet.finish('section');
}

// ── Entry points ──────────────────────────────────────────────────────────────

/** One drawing of the hall. */
export function buildDrawing(layout: HallLayout, view: DrawingViewId, openings: readonly DrawingOpening[] = []): Drawing {
  if (view === 'plan') return buildPlan(layout, openings);
  if (view === 'section') return buildSection(layout);
  return buildElevation(layout, view, openings);
}

/** All six drawings of the hall. */
export function buildDrawings(layout: HallLayout, openings: readonly DrawingOpening[] = []): Record<DrawingViewId, Drawing> {
  return Object.fromEntries(DRAWING_VIEWS.map((view) => [view, buildDrawing(layout, view, openings)])) as Record<
    DrawingViewId,
    Drawing
  >;
}
