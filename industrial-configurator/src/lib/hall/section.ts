/**
 * The hall's cross-section: everything that is the same at every frame (the XY plane).
 * Two roof types share it: `gable` (two slopes, apex at x = 0, drawn below) and `mono` (one slope across the whole
 * width, rising from the low side's eave to the high side's; the low eave is at the given height).
 *
 *              ridge
 *             /     \            roofTop        = roofUnderside + panel
 *           /   ___   \          roofUnderside  = rafterTop + purlin
 *         / __/     \__ \        rafterTop      = rafterBottom + rafter depth
 *        |_/           \_|       rafterBottom   = height at the inner column face, rising at the roof pitch
 *        | |           | |
 *        | |<- width ->| |
 *
 * All four roof lines are parallel; each is a function of x, valid past the column out to the roof edge.
 */
import {
  COLUMN_DEPTH,
  COUNT_EPSILON,
  EAVE_PURLIN_INSET,
  GIRT_DEPTH,
  MAX_PURLIN_SPACING,
  PURLIN_SIZE,
  RAFTER_DEPTH,
  RIDGE_PURLIN_OFFSET,
  ROOF_OVERHANG,
  ROOF_PITCH_DEG,
  SHEET_THICKNESS,
} from './constants';
import type { HallHalfWidths, HallParams, RoofType, Side } from './types';

export interface HallSection {
  /** Roof pitch in radians. */
  pitch: number;
  halfWidths: HallHalfWidths;
  panelThickness: number;
  rafterBottomY: (x: number) => number;
  rafterTopY: (x: number) => number;
  roofUndersideY: (x: number) => number;
  roofTopY: (x: number) => number;
  /** Length of one rafter along its axis: inner column face to apex (gable), or inner face to inner face (mono). */
  rafterLength: number;
  /** Purlin seats of one slope (x > 0 for the gable's right slope, ridge first), as a signed x. */
  purlinSeatXs: readonly number[];
  /** Every purlin seat of the roof, with the side whose rafter carries it. */
  purlinSeats: readonly { side: Side; x: number }[];
  roofType: RoofType;
  /** Mono only: the side whose eave is higher. */
  highSide: Side;
  /** The low eave's side (mono), or the side itself (gable): where gutters and the eave joint go. */
  isLowSide: (side: Side) => boolean;
}

type SectionParams = Pick<HallParams, 'width' | 'height' | 'panels' | 'insulationMm' | 'roofType' | 'highSide'>;

/** -1 for the left (-X) side, +1 for the right. */
export const sideSign = (side: Side) => (side === 'left' ? -1 : 1);

/** Wall and roof panel thickness: the sandwich core when panels are selected, plain sheeting otherwise. */
export function panelThicknessOf({ panels, insulationMm }: Pick<HallParams, 'panels' | 'insulationMm'>): number {
  return panels && insulationMm > 0 ? insulationMm / 1000 : SHEET_THICKNESS;
}

/** Evenly spaced values from `first` to `last`, as few as possible with gaps of at most `maxGap` (always >= 2). */
export function spreadEvenly(first: number, last: number, maxGap: number): number[] {
  const gaps = Math.max(1, Math.ceil((last - first) / maxGap - COUNT_EPSILON));
  return Array.from({ length: gaps + 1 }, (_, i) => (i === gaps ? last : first + ((last - first) * i) / gaps));
}

export function computeSection(params: SectionParams): HallSection {
  const pitch = (ROOF_PITCH_DEG * Math.PI) / 180;
  const slope = Math.tan(pitch);
  const alongSlope = 1 / Math.cos(pitch); // slope length per metre of plan, and vertical size of a tilted depth

  const panelThickness = panelThicknessOf(params);
  const columnInner = params.width / 2;
  const columnOuter = columnInner + COLUMN_DEPTH;
  const wallInner = columnOuter + GIRT_DEPTH;
  const wallOuter = wallInner + panelThickness;
  const halfWidths: HallHalfWidths = {
    columnInner,
    columnAxis: columnInner + COLUMN_DEPTH / 2,
    columnOuter,
    wallInner,
    wallOuter,
    roofEdge: wallOuter + ROOF_OVERHANG,
  };

  const roofType: RoofType = params.roofType ?? 'gable';
  const highSide: Side = params.highSide ?? 'right';
  const high = sideSign(highSide);
  /** Horizontal distance a point at `x` has risen from the (low) eave's inner column face, along the slope. */
  const rise = roofType === 'mono' ? (x: number) => columnInner + high * x : (x: number) => columnInner - Math.abs(x);

  const rafterBottomY = (x: number) => params.height + rise(x) * slope;
  const rafterTopY = (x: number) => rafterBottomY(x) + RAFTER_DEPTH * alongSlope;
  const roofUndersideY = (x: number) => rafterTopY(x) + PURLIN_SIZE * alongSlope;
  const roofTopY = (x: number) => roofUndersideY(x) + panelThickness * alongSlope;

  // Purlins: as few as the panel span allows, ordered from the top of the slope. Gable: from just beside the apex to the top of the column, per slope.
  // Mono: from the top of one column to the top of the other, all carried by the one rafter (the low side's).
  const eaveSeat = columnOuter - EAVE_PURLIN_INSET;
  const purlinSeatXs =
    roofType === 'mono'
      ? spreadEvenly(-eaveSeat, eaveSeat, MAX_PURLIN_SPACING / alongSlope).map((x) => -high * x) // high end first
      : spreadEvenly(RIDGE_PURLIN_OFFSET, eaveSeat, MAX_PURLIN_SPACING / alongSlope);
  const lowSide: Side = highSide === 'left' ? 'right' : 'left';
  const purlinSeats =
    roofType === 'mono'
      ? purlinSeatXs.map((x) => ({ side: lowSide, x }))
      : (['left', 'right'] as const).flatMap((side) => purlinSeatXs.map((x) => ({ side, x: sideSign(side) * x })));

  return {
    pitch,
    halfWidths,
    panelThickness,
    rafterBottomY,
    rafterTopY,
    roofUndersideY,
    roofTopY,
    rafterLength: (roofType === 'mono' ? 2 * columnInner : columnInner) * alongSlope,
    purlinSeatXs,
    purlinSeats,
    roofType,
    highSide,
    isLowSide: (side) => roofType !== 'mono' || side !== highSide,
  };
}
