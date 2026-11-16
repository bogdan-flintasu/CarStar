/**
 * The hall's cross-section: everything that is the same at every frame (the XY plane).
 *
 *              ridge
 *             /     \            roofTop        = roofUnderside + panel
 *           /   ___   \          roofUnderside  = rafterTop + purlin
 *         / __/     \__ \        rafterTop      = rafterBottom + rafter depth
 *        |_/           \_|       rafterBottom   = height at the inner column face, rising at the roof pitch
 *        | |           | |
 *        | |<- width ->| |
 *
 * All four roof lines are parallel; each is a function of |x|, valid past the column out to the roof edge.
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
import type { HallHalfWidths, HallParams } from './types';

export interface HallSection {
  /** Roof pitch in radians. */
  pitch: number;
  halfWidths: HallHalfWidths;
  panelThickness: number;
  rafterBottomY: (x: number) => number;
  rafterTopY: (x: number) => number;
  roofUndersideY: (x: number) => number;
  roofTopY: (x: number) => number;
  /** Length of one rafter along its axis, inner column face to apex. */
  rafterLength: number;
  /** Purlin seats of the right-hand slope (x > 0), ridge first. The left slope mirrors them. */
  purlinSeatXs: readonly number[];
}

type SectionParams = Pick<HallParams, 'width' | 'height' | 'panels' | 'insulationMm'>;

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

  const rafterBottomY = (x: number) => params.height + (columnInner - Math.abs(x)) * slope;
  const rafterTopY = (x: number) => rafterBottomY(x) + RAFTER_DEPTH * alongSlope;
  const roofUndersideY = (x: number) => rafterTopY(x) + PURLIN_SIZE * alongSlope;
  const roofTopY = (x: number) => roofUndersideY(x) + panelThickness * alongSlope;

  // Purlins: from just beside the apex to the top of the column, as few as the panel span allows.
  const ridgeSeat = RIDGE_PURLIN_OFFSET;
  const eaveSeat = columnOuter - EAVE_PURLIN_INSET;
  const purlinSeatXs = spreadEvenly(ridgeSeat, eaveSeat, MAX_PURLIN_SPACING / alongSlope);

  return {
    pitch,
    halfWidths,
    panelThickness,
    rafterBottomY,
    rafterTopY,
    roofUndersideY,
    roofTopY,
    rafterLength: columnInner * alongSlope,
    purlinSeatXs,
  };
}
