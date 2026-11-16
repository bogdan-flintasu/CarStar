/**
 * computeHallLayout: HallParams -> HallLayout. Pure, deterministic, no three.js.
 *
 * The single source of geometry for the hall. The 3D scene, the openings, the dimension lines and the price
 * all read this layout, so no formula is written twice. Positions come from the frame's geometry (pitch,
 * section sizes, maximum spans); there are no per-width or per-height cases.
 */
import {
  BASE_PLATE_THICKNESS,
  COUNT_EPSILON,
  DOWNPIPE_END_INSET,
  EAVE_JOINT_HEIGHT,
  FRAME_FLANGE_WIDTH,
  GUTTER_DEPTH,
  GUTTER_WIDTH,
  ROOF_OVERHANG,
  SLAB_APRON,
  SLAB_THICKNESS,
} from './constants';
import { resolveHallParams } from './params';
import { computeSection, type HallSection } from './section';
import type {
  HallColumn,
  HallDownpipe,
  HallFrame,
  HallGutter,
  HallLayout,
  HallParams,
  HallPurlin,
  HallRafter,
  HallSlab,
  RoofPlane,
  Side,
} from './types';
import { computeWalls, type HallEnds } from './walls';

const SIDES: readonly Side[] = ['left', 'right'];
/** -1 for the left (-X) side, +1 for the right. */
const sign = (side: Side) => (side === 'left' ? -1 : 1);

/** Frames at equal spacing, as few as `maxBay` allows, covering exactly Z = 0 ... -length. */
function placeFrames(length: number, maxBay: number): HallFrame[] {
  const bayCount = Math.max(1, Math.ceil(length / maxBay - COUNT_EPSILON));
  return Array.from({ length: bayCount + 1 }, (_, index) => ({
    index,
    z: index === 0 ? 0 : index === bayCount ? -length : (-length * index) / bayCount,
    isEnd: index === 0 || index === bayCount,
  }));
}

/** The cladding sits directly on the end frames' flanges. */
function placeEnds(length: number, panelThickness: number): HallEnds {
  const frontInner = FRAME_FLANGE_WIDTH / 2;
  const backInner = -length - FRAME_FLANGE_WIDTH / 2;
  return { frontInner, frontOuter: frontInner + panelThickness, backInner, backOuter: backInner - panelThickness };
}

function placeColumns(frames: readonly HallFrame[], section: HallSection, height: number): HallColumn[] {
  const baseY = BASE_PLATE_THICKNESS;
  const topY = height - EAVE_JOINT_HEIGHT;
  return frames.flatMap((frame) =>
    SIDES.map((side) => ({
      side,
      frame: frame.index,
      x: sign(side) * section.halfWidths.columnAxis,
      z: frame.z,
      baseY,
      topY,
      height: topY - baseY,
    })),
  );
}

function placeRafters(frames: readonly HallFrame[], section: HallSection): HallRafter[] {
  const eaveX = section.halfWidths.columnInner;
  return frames.flatMap((frame) =>
    SIDES.map((side) => ({
      side,
      frame: frame.index,
      z: frame.z,
      from: [sign(side) * eaveX, section.rafterBottomY(eaveX)] as const,
      to: [0, section.rafterBottomY(0)] as const,
      length: section.rafterLength,
    })),
  );
}

/** Purlins run the whole length in one line, flush with the outer flange edges of the end frames. */
function placePurlins(section: HallSection, ends: HallEnds): HallPurlin[] {
  return SIDES.flatMap((side) =>
    section.purlinSeatXs.map((seatX, index) => ({
      side,
      index,
      x: sign(side) * seatX,
      y: section.rafterTopY(seatX),
      zFrom: ends.frontInner,
      zTo: ends.backInner,
    })),
  );
}

function placeRoof(side: Side, section: HallSection, ends: HallEnds): RoofPlane {
  const edgeX = section.halfWidths.roofEdge;
  const zFront = ends.frontOuter + ROOF_OVERHANG;
  const zBack = ends.backOuter - ROOF_OVERHANG;
  const slopeLength = edgeX / Math.cos(section.pitch);
  return {
    side,
    eave: [sign(side) * edgeX, section.roofUndersideY(edgeX)],
    ridge: [0, section.roofUndersideY(0)],
    thickness: section.panelThickness,
    zFront,
    zBack,
    slopeLength,
    area: slopeLength * (zFront - zBack),
  };
}

function placeSlab(section: HallSection, ends: HallEnds): HallSlab {
  return {
    w: 2 * (section.halfWidths.wallOuter + SLAB_APRON),
    l: ends.frontOuter - ends.backOuter + 2 * SLAB_APRON,
    centerX: 0,
    centerZ: (ends.frontOuter + ends.backOuter) / 2,
    topY: 0,
    thickness: SLAB_THICKNESS,
  };
}

/** One gutter under each eave, hung on the outer wall face, with a downpipe at each of the four corners. */
function placeRainwater(section: HallSection, ends: HallEnds): { gutters: HallGutter[]; downpipes: HallDownpipe[] } {
  const wallX = section.halfWidths.wallOuter;
  const gutterY = section.roofUndersideY(wallX);
  const gutters = SIDES.map((side) => ({
    side,
    x: sign(side) * wallX,
    y: gutterY,
    zFrom: ends.frontOuter,
    zTo: ends.backOuter,
  }));
  const downpipes = SIDES.flatMap((side) =>
    [ends.frontOuter - DOWNPIPE_END_INSET, ends.backOuter + DOWNPIPE_END_INSET].map((z) => ({
      side,
      x: sign(side) * (wallX + GUTTER_WIDTH / 2),
      z,
      topY: gutterY - GUTTER_DEPTH,
      bottomY: 0,
    })),
  );
  return { gutters, downpipes };
}

export function computeHallLayout(input: HallParams): HallLayout {
  const params = resolveHallParams(input);
  const section = computeSection(params);
  const frames = placeFrames(params.length, params.bay);
  const ends = placeEnds(params.length, section.panelThickness);
  const bayCount = frames.length - 1;
  const roof = { left: placeRoof('left', section, ends), right: placeRoof('right', section, ends) };
  const { roofEdge } = section.halfWidths;

  return {
    params,
    pitch: section.pitch,
    bayCount,
    bay: params.length / bayCount,
    eaveY: section.rafterTopY(section.halfWidths.columnInner),
    ridgeY: section.rafterTopY(0),
    halfWidths: section.halfWidths,
    panelThickness: section.panelThickness,
    frames,
    columns: placeColumns(frames, section, params.height),
    rafters: placeRafters(frames, section),
    rafterLength: section.rafterLength,
    purlins: placePurlins(section, ends),
    purlinsPerSide: section.purlinSeatXs.length,
    walls: computeWalls(section, ends, frames),
    roof,
    slab: placeSlab(section, ends),
    groundY: params.foundation ? -SLAB_THICKNESS : 0,
    ...placeRainwater(section, ends),
    bounds: {
      min: [-roofEdge, 0, roof.left.zBack],
      max: [roofEdge, section.roofTopY(0), roof.left.zFront],
    },
  };
}
