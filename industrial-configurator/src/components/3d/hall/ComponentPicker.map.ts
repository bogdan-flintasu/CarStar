/**
 * Click a component (T5b): what a hit in the 3D scene IS, as an element of the HallLayout. Pure (no React, no scene).
 *
 * ── Instance-order contract (relied on, owned by Hall / Steel / KitInstances / placements.ts) ─────────────────────────
 *   1. Every kit piece is ONE InstancedMesh whose `name` is the kit piece name (`Column`, `Rafter`, `Purlin`, …, see
 *      KIT_PIECES in kit.ts), at full and light detail alike.
 *   2. Instance `i` of that mesh is `placeKit(layout)[name][i]`: instance order = placement order, nothing culled,
 *      sorted or merged in between. placeKit's order is:
 *        Column, BasePlate        layout.columns order (frame by frame, left then right)
 *        EaveHaunch / …High       layout.columns filtered by !isHigh / isHigh
 *        GirtCleat                per column (layout order), one per girt level
 *        Rafter                   layout.rafters order (gable: frame by frame, left then right; mono: one per frame)
 *        Purlin                   per purlin line (layout.purlins order), one span per bay from the front
 *        Downpipe, Shoe, Outlet   layout.downpipes order
 *      (Gutter pieces are resolved by the side their transform is on, so their span count does not matter.)
 *   3. The wall meshes are named by their LegacyWallId (`PereteFata`, `PereteSpate`, `PereteSTG`, `PereteDR`), the roof
 *      mesh is `Roof`. The tests check 2. against placeKit for several halls, so a change there fails loudly.
 *
 * ── What can be picked ────────────────────────────────────────────────────────────────────────────────────────────────
 *   Column, Rafter, Purlin (one bay span), wall panel (a whole wall), roof panel (one slope), Gutter (the whole gutter
 *   line), Downpipe. Small parts map to the member they belong to, so a click on them is never lost:
 *     BasePlate, EaveHaunch, EaveHaunchHigh, GirtCleat -> their column;  GutterOutlet, GutterEndCap -> their gutter;
 *     DownpipeShoe, DownpipeOutlet -> their downpipe.
 *   Not pickable (a hit on them selects nothing, and does not reach what is behind): Bolt, RidgeJoint, PurlinCleat,
 *   RidgeCap, the flashings (Trims), the slab and the ground.
 */
import type { Matrix4 } from 'three';
import {
  type HallLayout,
  type LegacyWallId,
  type Side,
  type Vec2,
  type Vec3,
  type WallKey,
  formatMetres,
  formatNumber,
  wallPointToWorld,
} from '@/lib/hall';
import type { ColorChoice, ColorComponent, ColorOption } from '@/lib/colors';
import { placeKit, type KitPlacements } from './placements';
import type { KitPieceName } from './kit';

// ─── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type DownpipeEnd = 'front' | 'back';

/** Which layout element a pick refers to: just enough to find it again in any layout. */
export type ComponentRef =
  | { kind: 'column'; side: Side; frame: number }
  | { kind: 'rafter'; side: Side; frame: number }
  /** `line`: 0 = the purlin at the top of the slope, counting down. `bay`: 0 = the front bay. */
  | { kind: 'purlin'; side: Side; line: number; bay: number }
  | { kind: 'wallPanel'; wall: WallKey }
  /** `side`: the slope's (low) eave side; a mono roof has one slope. */
  | { kind: 'roofPanel'; side: Side }
  | { kind: 'gutter'; side: Side }
  | { kind: 'downpipe'; side: Side; end: DownpipeEnd };

export type ComponentKind = ComponentRef['kind'];

export interface ComponentDetail {
  label: string;
  value: string;
}

interface PickedBase {
  /** Stable id of the element, e.g. `column:left:3`, `purlin:right:0:2`, `wallPanel:front`. Same element, same key. */
  key: string;
  /** Romanian name for the card title, e.g. "Stâlp". */
  label: string;
  /** Rows for the card, already formatted (metres with a comma, m², degrees). */
  details: readonly ComponentDetail[];
  /** Key into the configurator's `colors` (and palette) for the colour name and RAL: see `componentColor`. */
  colorComponent: ColorComponent;
}

export type PickedComponent = PickedBase &
  (
    | { kind: 'column'; side: Side; frame: number; frameLabel: string; height: number; isHigh: boolean }
    | { kind: 'rafter'; side: Side; frame: number; frameLabel: string; length: number }
    | { kind: 'purlin'; side: Side; line: number; bay: number; length: number }
    | { kind: 'wallPanel'; wall: WallKey; wallId: LegacyWallId; width: number; height: number; area: number }
    | { kind: 'roofPanel'; side: Side; area: number; slopeLength: number; length: number; pitchDeg: number }
    | { kind: 'gutter'; side: Side; length: number }
    | { kind: 'downpipe'; side: Side; end: DownpipeEnd; height: number }
  );

/** One raycast hit, as the picker sees it. */
export interface PickHit {
  /** `Object3D.name` of the hit mesh. */
  objectName: string;
  /** `intersection.instanceId` for an InstancedMesh. */
  instanceId?: number;
  /** World position of the hit. */
  point: Vec3;
}

/** A hit with what the scene graph says about it (see ComponentPicker.tsx, `toSceneHit`). */
export interface SceneHit extends PickHit {
  /** Part of an opening (door, window, its pick target or handles): openings handle their own clicks. */
  opening?: boolean;
  /** An editing helper that is never rendered (dimension lines, snap guides, the sky dome…): clicks pass through. */
  helper?: boolean;
}

/** What a click does. `opening`: nothing here (WallOpening selects it). `empty`: clear the selection. */
export type PickOutcome = { kind: 'opening' } | { kind: 'empty' } | { kind: 'component'; picked: PickedComponent };

/** What the UI needs to draw the highlight, in world coordinates. */
export type HighlightTarget =
  /** Instances of one InstancedMesh (a gutter line is several spans; every other piece is one instance). */
  | { type: 'instances'; objectName: KitPieceName; instances: readonly { instanceId: number; matrix: Matrix4 }[] }
  /**
   * A flat face: a wall's outer face, a roof slope's top surface. `polygon` is closed implicitly, world coordinates,
   * lying on the face; `normal` points out of the hall (offset the overlay a few mm along it to avoid z-fighting).
   */
  | { type: 'face'; objectName: LegacyWallId | 'Roof'; polygon: readonly Vec3[]; normal: Vec3 };

// ─── Labels ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const SIDE_LABEL: Record<Side, string> = { left: 'stânga', right: 'dreapta' };
const END_LABEL: Record<DownpipeEnd, string> = { front: 'față', back: 'spate' };
const WALL_LABEL: Record<WallKey, string> = {
  front: 'Perete față',
  back: 'Perete spate',
  left: 'Perete lateral stânga',
  right: 'Perete lateral dreapta',
};

/** Frames are counted from 1 at the front: "Ax 3, stânga". */
export const frameLabel = (frame: number, side: Side) => `Ax ${frame + 1}, ${SIDE_LABEL[side]}`;
const formatArea = (area: number) => `${formatNumber(area)} m²`;
const formatDegrees = (deg: number) => `${formatNumber(Math.round(deg * 10) / 10)}°`;
const sideOf = (x: number): Side => (x < 0 ? 'left' : 'right');

// ─── Ref <-> key ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function refKey(ref: ComponentRef): string {
  switch (ref.kind) {
    case 'column':
    case 'rafter':
      return `${ref.kind}:${ref.side}:${ref.frame}`;
    case 'purlin':
      return `purlin:${ref.side}:${ref.line}:${ref.bay}`;
    case 'wallPanel':
      return `wallPanel:${ref.wall}`;
    case 'roofPanel':
    case 'gutter':
      return `${ref.kind}:${ref.side}`;
    case 'downpipe':
      return `downpipe:${ref.side}:${ref.end}`;
  }
}

const isSide = (s: string | undefined): s is Side => s === 'left' || s === 'right';
const toIndex = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null);

export function parseKey(key: string): ComponentRef | null {
  const [kind, a, b, c] = key.split(':');
  if (kind === 'wallPanel') return a === 'front' || a === 'back' || a === 'left' || a === 'right' ? { kind, wall: a } : null;
  if (!isSide(a)) return null;
  if (kind === 'roofPanel' || kind === 'gutter') return { kind, side: a };
  if (kind === 'downpipe') return b === 'front' || b === 'back' ? { kind, side: a, end: b } : null;
  const frame = toIndex(b);
  if ((kind === 'column' || kind === 'rafter') && frame !== null) return { kind, side: a, frame };
  const line = toIndex(b);
  const bay = toIndex(c);
  if (kind === 'purlin' && line !== null && bay !== null) return { kind, side: a, line, bay };
  return null;
}

// ─── Describing an element ────────────────────────────────────────────────────────────────────────────────────────────

/** Purlin span `bay` of a line: [front z, back z]. Joints are the line's ends and the inner frames (placements.ts). */
function purlinSpan(layout: HallLayout, zFrom: number, zTo: number, bay: number): [number, number] | null {
  const joints = [zFrom, ...layout.frames.filter((f) => !f.isEnd).map((f) => f.z), zTo];
  return bay >= 0 && bay < joints.length - 1 ? [joints[bay], joints[bay + 1]] : null;
}

/** The full card data of an element, or null when this layout has no such element. */
export function describe(ref: ComponentRef, layout: HallLayout): PickedComponent | null {
  const key = refKey(ref);
  const mono = layout.roofType === 'mono';
  switch (ref.kind) {
    case 'column': {
      const c = layout.columns.find((col) => col.side === ref.side && col.frame === ref.frame);
      if (!c) return null;
      const position = frameLabel(c.frame, c.side);
      return {
        ...ref,
        key,
        label: 'Stâlp',
        colorComponent: 'steel',
        frameLabel: position,
        height: c.height,
        isHigh: mono && c.isHigh,
        details: [
          { label: 'Poziție', value: position },
          { label: 'Înălțime', value: formatMetres(c.height) },
          ...(mono ? [{ label: 'Latura', value: c.isHigh ? 'înaltă' : 'joasă' }] : []),
        ],
      };
    }
    case 'rafter': {
      const r = layout.rafters.find((raf) => raf.side === ref.side && raf.frame === ref.frame);
      if (!r) return null;
      const position = mono ? `Ax ${r.frame + 1}` : frameLabel(r.frame, r.side);
      return {
        ...ref,
        key,
        label: 'Riglă de cadru',
        colorComponent: 'steel',
        frameLabel: position,
        length: r.length,
        details: [
          { label: 'Poziție', value: position },
          { label: 'Lungime', value: formatMetres(r.length) },
          { label: 'Panta', value: formatDegrees((layout.pitch * 180) / Math.PI) },
        ],
      };
    }
    case 'purlin': {
      const p = layout.purlins.find((pur) => pur.side === ref.side && pur.index === ref.line);
      const span = p && purlinSpan(layout, p.zFrom, p.zTo, ref.bay);
      if (!p || !span) return null;
      const length = span[0] - span[1];
      const from = mono ? 'de la latura înaltă' : 'de la coamă';
      return {
        ...ref,
        key,
        label: 'Pană',
        colorComponent: 'steel',
        length,
        details: [
          ...(mono ? [] : [{ label: 'Panta', value: SIDE_LABEL[p.side] }]),
          { label: 'Rând', value: `${p.index + 1} ${from}` },
          { label: 'Travee', value: `${ref.bay + 1} din ${layout.bayCount}` },
          { label: 'Lungime', value: formatMetres(length) },
        ],
      };
    }
    case 'wallPanel': {
      const w = layout.walls[ref.wall];
      return {
        ...ref,
        key,
        label: WALL_LABEL[w.key],
        colorComponent: 'walls',
        wallId: w.id,
        width: w.spanH,
        height: w.apexV,
        area: w.area,
        details: [
          { label: 'Lățime', value: formatMetres(w.spanH) },
          { label: 'Înălțime la streașină', value: formatMetres(w.spanV) },
          ...(w.apexV > w.spanV + 1e-6 ? [{ label: 'Înălțime maximă', value: formatMetres(w.apexV) }] : []),
          { label: 'Suprafață (fără goluri)', value: formatArea(w.area) },
        ],
      };
    }
    case 'roofPanel': {
      const plane = layout.roof.find((pl) => pl.side === ref.side);
      if (!plane) return null;
      const pitchDeg = (layout.pitch * 180) / Math.PI;
      const length = plane.zFront - plane.zBack;
      return {
        ...ref,
        key,
        label: mono ? 'Acoperiș (o apă)' : `Acoperiș, panta ${SIDE_LABEL[plane.side]}`,
        colorComponent: 'roof',
        area: plane.area,
        slopeLength: plane.slopeLength,
        length,
        pitchDeg,
        details: [
          { label: 'Lungime pe pantă', value: formatMetres(plane.slopeLength) },
          { label: 'Lungime', value: formatMetres(length) },
          { label: 'Panta', value: formatDegrees(pitchDeg) },
          { label: 'Suprafață', value: formatArea(plane.area) },
        ],
      };
    }
    case 'gutter': {
      const g = layout.gutters.find((gut) => gut.side === ref.side);
      if (!g) return null;
      const length = g.zFrom - g.zTo;
      return {
        ...ref,
        key,
        label: `Jgheab ${SIDE_LABEL[g.side]}`,
        colorComponent: 'trims',
        length,
        details: [{ label: 'Lungime', value: formatMetres(length) }],
      };
    }
    case 'downpipe': {
      const d = layout.downpipes.find((dp) => dp.side === ref.side && dp.end === ref.end);
      if (!d) return null;
      const height = d.topY - d.bottomY;
      return {
        ...ref,
        key,
        label: `Burlan ${SIDE_LABEL[d.side]}, ${END_LABEL[d.end]}`,
        colorComponent: 'trims',
        height,
        details: [{ label: 'Înălțime', value: formatMetres(height) }],
      };
    }
  }
}

/** Re-reads a selection in a new layout (the hall was resized): fresh sizes, or null when the element is gone. */
export function resolveKey(key: string, layout: HallLayout): PickedComponent | null {
  const ref = parseKey(key);
  return ref ? describe(ref, layout) : null;
}

// ─── Instance tables ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Per kit piece: instance id -> element (null: not pickable). Built in placeKit's order (see the header). */
type InstanceTable = Partial<Record<KitPieceName, readonly (ComponentRef | null)[]>>;

interface LayoutIndex {
  placements: KitPlacements;
  table: InstanceTable;
}

const indexCache = new WeakMap<HallLayout, LayoutIndex>();

function buildTable(layout: HallLayout, placements: KitPlacements): InstanceTable {
  const column = (c: { side: Side; frame: number }): ComponentRef => ({ kind: 'column', side: c.side, frame: c.frame });
  const downpipe = layout.downpipes.map((d): ComponentRef => ({ kind: 'downpipe', side: d.side, end: d.end }));
  // Gutter spans, outlets and end caps: by the side their transform is on (the x of the matrix's translation).
  const bySide = (name: KitPieceName) =>
    placements[name].map((p): ComponentRef => ({ kind: 'gutter', side: sideOf(p.matrix.elements[12]) }));
  return {
    Column: layout.columns.map(column),
    BasePlate: layout.columns.map(column),
    EaveHaunch: layout.columns.filter((c) => !c.isHigh).map(column),
    EaveHaunchHigh: layout.columns.filter((c) => c.isHigh).map(column),
    GirtCleat: layout.columns.flatMap((c) => c.girtLevels.map(() => column(c))),
    Rafter: layout.rafters.map((r): ComponentRef => ({ kind: 'rafter', side: r.side, frame: r.frame })),
    Purlin: layout.purlins.flatMap((p) =>
      Array.from({ length: layout.bayCount }, (_, bay): ComponentRef => ({ kind: 'purlin', side: p.side, line: p.index, bay })),
    ),
    Gutter: bySide('Gutter'),
    GutterOutlet: bySide('GutterOutlet'),
    GutterEndCap: bySide('GutterEndCap'),
    Downpipe: downpipe,
    DownpipeShoe: downpipe,
    DownpipeOutlet: downpipe,
  };
}

function layoutIndex(layout: HallLayout): LayoutIndex {
  let index = indexCache.get(layout);
  if (!index) {
    const placements = placeKit(layout);
    index = { placements, table: buildTable(layout, placements) };
    indexCache.set(layout, index);
  }
  return index;
}

/** For tests: the instance table of a layout (instance id -> element key, null = not pickable). */
export function instanceKeys(layout: HallLayout, piece: KitPieceName): (string | null)[] | undefined {
  return layoutIndex(layout).table[piece]?.map((ref) => (ref ? refKey(ref) : null));
}

// ─── Resolving hits ───────────────────────────────────────────────────────────────────────────────────────────────────

const WALL_BY_ID: Record<LegacyWallId, WallKey> = {
  PereteFata: 'front',
  PereteSpate: 'back',
  PereteSTG: 'left',
  PereteDR: 'right',
};

/** The element under one hit, or null (not pickable, unknown, or an instance id this layout does not have). */
export function resolvePick(hit: PickHit, layout: HallLayout): PickedComponent | null {
  const { objectName, instanceId, point } = hit;
  if (objectName in WALL_BY_ID) return describe({ kind: 'wallPanel', wall: WALL_BY_ID[objectName as LegacyWallId] }, layout);
  if (objectName === 'Roof') {
    // Gable: the slope on the side of the hit (the ridge is at x = 0). Mono: the one slope.
    const side = layout.roof.length === 1 ? layout.roof[0].side : sideOf(point[0]);
    return describe({ kind: 'roofPanel', side }, layout);
  }
  const table = layoutIndex(layout).table[objectName as KitPieceName];
  if (!table || instanceId === undefined) return null;
  const ref = table[instanceId];
  return ref ? describe(ref, layout) : null;
}

/**
 * The click rule over all hits along the ray, nearest first: helpers are skipped; the first other hit decides.
 * An opening in front wins (WallOpening selects it); a component is picked; anything else (ground, a bolt, a flashing,
 * nothing at all) is empty space.
 */
export function pickFromHits(hits: readonly SceneHit[], layout: HallLayout): PickOutcome {
  const first = hits.find((hit) => hit.opening || !hit.helper);
  if (!first) return { kind: 'empty' };
  if (first.opening) return { kind: 'opening' };
  const picked = resolvePick(first, layout);
  return picked ? { kind: 'component', picked } : { kind: 'empty' };
}

/** Elements drawn with the cladding: they cannot stay selected while it is hidden. */
export const isCladdingKind = (kind: ComponentKind) =>
  kind === 'wallPanel' || kind === 'roofPanel' || kind === 'gutter' || kind === 'downpipe';

// ─── Highlight ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Where the main piece of an element lives: highlighting a column lights the column, not its base plate. */
const MAIN_PIECE: Partial<Record<ComponentKind, KitPieceName>> = {
  column: 'Column',
  rafter: 'Rafter',
  purlin: 'Purlin',
  gutter: 'Gutter',
  downpipe: 'Downpipe',
};

/** What to draw for a picked element in this layout; null when the layout no longer has it. */
export function highlightTarget(picked: Pick<PickedComponent, 'key'>, layout: HallLayout): HighlightTarget | null {
  const ref = parseKey(picked.key);
  if (!ref) return null;
  if (ref.kind === 'wallPanel') {
    const wall = layout.walls[ref.wall];
    return {
      type: 'face',
      objectName: wall.id,
      polygon: wall.polygon.map(([h, v]: Vec2) => wallPointToWorld(wall, h, v)),
      normal: wall.normal,
    };
  }
  if (ref.kind === 'roofPanel') {
    const plane = layout.roof.find((p) => p.side === ref.side);
    if (!plane) return null;
    const up = plane.plumbThickness;
    const [eaveX, eaveY] = plane.eave;
    const [topX, topY] = plane.ridge;
    // The slope's top surface; its normal leans away from the slope's top towards the eave side.
    const run = Math.abs(topX - eaveX);
    const rise = topY - eaveY;
    const out = Math.sign(eaveX - topX);
    const len = Math.hypot(run, rise);
    return {
      type: 'face',
      objectName: 'Roof',
      polygon: [
        [eaveX, eaveY + up, plane.zFront],
        [topX, topY + up, plane.zFront],
        [topX, topY + up, plane.zBack],
        [eaveX, eaveY + up, plane.zBack],
      ],
      normal: [(out * rise) / len, run / len, 0],
    };
  }
  const name = MAIN_PIECE[ref.kind]!;
  const { placements, table } = layoutIndex(layout);
  const instances = (table[name] ?? []).flatMap((r, instanceId) =>
    r && refKey(r) === picked.key ? [{ instanceId, matrix: placements[name][instanceId].matrix }] : [],
  );
  return instances.length > 0 ? { type: 'instances', objectName: name, instances } : null;
}

// ─── Colour ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Colour name, RAL and hex of a picked element, from the configurator's `colors` and `palette`. */
export function componentColor(
  picked: Pick<PickedComponent, 'colorComponent'>,
  colors: Readonly<Record<ColorComponent, ColorChoice>>,
  palette: readonly ColorOption[],
): { name: string; ral: string; hex: string } {
  const choice = colors[picked.colorComponent];
  const option = palette.find((o) => o.component === picked.colorComponent && o.id === choice.id);
  return { name: choice.name, ral: option?.ral ?? '', hex: choice.hex };
}

// ─── Gestures ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** How far (CSS px) a pointer may travel between down and up and still be a click, not an orbit drag. */
export const CLICK_SLOP_PX = { mouse: 5, touch: 10 } as const;

/** A press is a click when a single pointer went down and up within the slop. */
export function isClickGesture(
  down: { x: number; y: number },
  up: { x: number; y: number },
  pointerType: string,
  opts: { multiTouch?: boolean } = {},
): boolean {
  if (opts.multiTouch) return false;
  const slop = pointerType === 'mouse' ? CLICK_SLOP_PX.mouse : CLICK_SLOP_PX.touch;
  return Math.hypot(up.x - down.x, up.y - down.y) <= slop;
}
