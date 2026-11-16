/**
 * Types of the hall layout. Plain data only (numbers, tuples, arrays): safe to memoise, compare and serialise.
 *
 * World frame (metres), same as the kit GLB:
 *   +Y up, Y = 0 is the finished floor (column base, top of the slab).
 *   +X across the width: left (STG) is -X, right (DR) is +X, the hall is centred on X = 0.
 *   Z along the length: the front frame is at Z = 0, the back frame at Z = -length.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export type Side = 'left' | 'right';
export type WallKey = 'front' | 'back' | 'left' | 'right';
/** Ids used by the openings store (the original mesh names). */
export type LegacyWallId = 'PereteFata' | 'PereteSpate' | 'PereteSTG' | 'PereteDR';

export interface HallParams {
  /** Frame-to-frame length: axis of the first frame to axis of the last one. */
  length: number;
  /** Clear width between the inner faces of the columns. */
  width: number;
  /** Clear height at the eave: floor to the rafter's underside at the inner column face. */
  height: number;
  /** Largest allowed frame spacing; defaults to MAX_BAY_SPACING. */
  bay?: number;
  /** Concrete slab included. */
  foundation: boolean;
  /** Sandwich panels (true) or single-skin sheeting (false). */
  panels: boolean;
  /** Sandwich panel core thickness in millimetres; ignored when `panels` is false. */
  insulationMm: number;
}

export interface HallFrame {
  index: number;
  z: number;
  /** First or last frame (carries a gable wall). */
  isEnd: boolean;
}

/** One column: a vertical member on its axis, from the top of the base plate to the eave joint. */
export interface HallColumn {
  side: Side;
  frame: number;
  x: number;
  z: number;
  baseY: number;
  topY: number;
  height: number;
}

/** One rafter, given on its bottom-flange line (the kit's `Rafter` anchor) in the frame's XY plane. */
export interface HallRafter {
  side: Side;
  frame: number;
  z: number;
  /** Bottom flange at the inner column face. */
  from: Vec2;
  /** Bottom flange at the apex (x = 0). */
  to: Vec2;
  length: number;
}

/** One continuous purlin line. (x, y) is its seat: the centre of its bottom face, on the rafters' top flange. */
export interface HallPurlin {
  side: Side;
  /** 0 = ridge purlin, counting towards the eave. */
  index: number;
  x: number;
  y: number;
  zFrom: number;
  zTo: number;
}

/**
 * The exterior face of one wall.
 * A point (h, v) on the face is `origin + h * axisH + v * axisV`; use `wallPointToWorld`.
 * `h` runs left to right as seen from outside on the front, back and right walls. On the LEFT wall it runs
 * front to back as well (right to left from outside), so both side walls share the same `h` for the same frame.
 */
export interface WallDescriptor {
  key: WallKey;
  id: LegacyWallId;
  /** World position of (h, v) = (0, 0): a bottom corner of the exterior face. */
  origin: Vec3;
  axisH: Vec3;
  axisV: Vec3;
  /** Outward unit normal. */
  normal: Vec3;
  /** Rotation about +Y that turns +Z into `normal` (radians); orients anything mounted on the wall. */
  yaw: number;
  /** Width of the face along axisH. */
  spanH: number;
  /** Height of the rectangular part (up to the eave). */
  spanV: number;
  /** Highest point: the gable apex on the end walls, equal to spanV on the side walls. */
  apexV: number;
  /** Cladding thickness, measured inwards from the face. */
  thickness: number;
  /** Outline of the face in (h, v): a rectangle for side walls, a pentagon for gables. Starts at (0, 0). */
  polygon: readonly Vec2[];
  /** Face area in square metres. */
  area: number;
  /** `h` of the axis of every column standing behind the wall. */
  supports: readonly number[];
  /** Half the width, along `h`, that each of those columns occupies. */
  supportHalfWidth: number;
}

/** One roof slope, given by its underside in the XY plane; the panel is `thickness` thick, square to the slope. */
export interface RoofPlane {
  side: Side;
  /** Underside at the outer edge (the drip edge). */
  eave: Vec2;
  /** Underside at the ridge (x = 0). */
  ridge: Vec2;
  thickness: number;
  zFront: number;
  zBack: number;
  slopeLength: number;
  area: number;
}

export interface HallSlab {
  /** Size across the width (X) and along the length (Z), apron included. */
  w: number;
  l: number;
  centerX: number;
  centerZ: number;
  topY: number;
  thickness: number;
}

/** Eave gutter line: (x, y) is its inner top edge, on the outer wall face. */
export interface HallGutter {
  side: Side;
  x: number;
  y: number;
  zFrom: number;
  zTo: number;
}

export interface HallDownpipe {
  side: Side;
  x: number;
  z: number;
  topY: number;
  bottomY: number;
}

/** Half-widths (distance from the hall's centre plane) of the frame section's vertical faces. */
export interface HallHalfWidths {
  columnInner: number;
  columnAxis: number;
  columnOuter: number;
  wallInner: number;
  wallOuter: number;
  roofEdge: number;
}

export interface HallLayout {
  /** The input, with defaults resolved. */
  params: Required<HallParams>;
  /** Roof pitch in radians. */
  pitch: number;
  bayCount: number;
  /** Actual frame spacing: length / bayCount, never more than params.bay. */
  bay: number;
  /** Top of steel (rafter top flange) at the inner column face. */
  eaveY: number;
  /** Top of steel at the apex: eaveY + (width / 2) * tan(pitch). */
  ridgeY: number;
  halfWidths: HallHalfWidths;
  /** Wall and roof panel thickness. */
  panelThickness: number;
  frames: readonly HallFrame[];
  columns: readonly HallColumn[];
  rafters: readonly HallRafter[];
  rafterLength: number;
  purlins: readonly HallPurlin[];
  purlinsPerSide: number;
  walls: Readonly<Record<WallKey, WallDescriptor>>;
  roof: Readonly<Record<Side, RoofPlane>>;
  slab: HallSlab;
  /** Terrain level: below the slab when there is a foundation, at the floor otherwise. */
  groundY: number;
  gutters: readonly HallGutter[];
  downpipes: readonly HallDownpipe[];
  /** Axis-aligned box around steel, cladding and roof (not the slab apron). */
  bounds: { min: Vec3; max: Vec3 };
}
