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
/** `gable`: two slopes meeting at a ridge on the centre line ("2 ape"). `mono`: one slope across the width ("o apă"). */
export type RoofType = 'gable' | 'mono';
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
  /** Defaults to `gable`. On a `mono` roof, `height` is the clear height at the low eave. */
  roofType?: RoofType;
  /** Mono roof only: the side whose eave is higher. Defaults to `right`. */
  highSide?: Side;
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
  /** Heights of the cladding fixings (girt cleats) on its outer face. */
  girtLevels: readonly number[];
  /** Mono roof: the column under the high eave (its joint slopes the other way). */
  isHigh: boolean;
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
  /** Highest point: the apex of a gable or the high end of a mono-pitch end wall; equal to spanV on side walls. */
  apexV: number;
  /** `h` of the highest point: the middle of a gable, one end of a mono-pitch end wall (spanH / 2 on side walls). */
  apexH: number;
  /** Cladding thickness, measured inwards from the face. */
  thickness: number;
  /** Outline of the face in (h, v): a rectangle for side walls, a pentagon for gables, a trapezoid for mono-pitch end walls. Starts at (0, 0). */
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
  /** The side of its (low) eave. */
  side: Side;
  /** Underside at the outer edge (the drip edge). */
  eave: Vec2;
  /** Underside at the top of the slope: the ridge (x = 0) on a gable, the high edge on a mono-pitch roof. */
  ridge: Vec2;
  thickness: number;
  /** The same thickness measured plumb: the top surface is this far above the underside. */
  plumbThickness: number;
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

/** One downpipe on its axis, under the gutter's centreline: from its shoe (`bottomY`) up to the gutter outlet (`topY`). */
export interface HallDownpipe {
  side: Side;
  /** Which end of the hall it stands at; its shoe discharges away from that gable. */
  end: 'front' | 'back';
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
  roofType: RoofType;
  /** Mono roof: the high side. Gable: null. */
  highSide: Side | null;
  bayCount: number;
  /** Actual frame spacing: length / bayCount, never more than params.bay. */
  bay: number;
  /** Top of steel (rafter top flange) at the inner column face. */
  eaveY: number;
  /** Highest top of steel: the apex of a gable (eaveY + (width / 2) * tan(pitch)), the high eave of a mono roof. */
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
  /** Heights of the cladding fixings (girt cleats) on the low-side columns (every column of a gable hall). */
  girtLevels: readonly number[];
  walls: Readonly<Record<WallKey, WallDescriptor>>;
  /** Gable: the left and right slopes. Mono: one slope, `side` = the low side. */
  roof: readonly RoofPlane[];
  slab: HallSlab;
  /** Terrain level: below the slab when there is a foundation, at the floor otherwise. */
  groundY: number;
  gutters: readonly HallGutter[];
  downpipes: readonly HallDownpipe[];
  /** Axis-aligned box around steel, cladding and roof (not the slab apron). */
  bounds: { min: Vec3; max: Vec3 };
}
