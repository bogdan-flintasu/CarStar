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
  DOWNPIPE_DISCHARGE_HEIGHT,
  DOWNPIPE_OUTLET_DROP,
  EAVE_JOINT_HEIGHT,
  END_WALL_GIRT_DEPTH,
  FRAME_FLANGE_WIDTH,
  GIRT_END_CLEARANCE,
  GUTTER_WIDTH,
  MAX_GIRT_SPACING,
  ROOF_OVERHANG,
  SLAB_APRON,
  SLAB_THICKNESS,
} from './constants';
import { resolveHallParams } from './params';
import { computeSection, sideSign as sign, spreadEvenly, type HallSection } from './section';
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
const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left');

/** Frames at equal spacing, as few as `maxBay` allows, covering exactly Z = 0 ... -length. */
function placeFrames(length: number, maxBay: number): HallFrame[] {
  const bayCount = Math.max(1, Math.ceil(length / maxBay - COUNT_EPSILON));
  return Array.from({ length: bayCount + 1 }, (_, index) => ({
    index,
    z: index === 0 ? 0 : index === bayCount ? -length : (-length * index) / bayCount,
    isEnd: index === 0 || index === bayCount,
  }));
}

/** The end walls stand on girts outside the end frames, clear of their base plates and joints. */
function placeEnds(length: number, panelThickness: number): HallEnds {
  const frontInner = FRAME_FLANGE_WIDTH / 2 + END_WALL_GIRT_DEPTH;
  const backInner = -length - frontInner;
  return { frontInner, frontOuter: frontInner + panelThickness, backInner, backOuter: backInner - panelThickness };
}

/** Cladding fixings up a column whose steel ends at `columnTop`, as few rows as the panel span allows. */
function girtLevelsBelow(columnTop: number): number[] {
  return spreadEvenly(GIRT_END_CLEARANCE, columnTop - GIRT_END_CLEARANCE, MAX_GIRT_SPACING);
}

/** Each column stops the eave joint's height below the rafter's underside at its inner face. */
function placeColumns(frames: readonly HallFrame[], section: HallSection): HallColumn[] {
  const baseY = BASE_PLATE_THICKNESS;
  const inner = section.halfWidths.columnInner;
  return frames.flatMap((frame) =>
    SIDES.map((side) => {
      const topY = section.rafterBottomY(sign(side) * inner) - EAVE_JOINT_HEIGHT;
      return {
        side,
        frame: frame.index,
        x: sign(side) * section.halfWidths.columnAxis,
        z: frame.z,
        baseY,
        topY,
        height: topY - baseY,
        girtLevels: girtLevelsBelow(topY),
        isHigh: !section.isLowSide(side),
      };
    }),
  );
}

/** Gable: a rafter per side, eave to apex. Mono: one rafter per frame, from the low eave up to the high one. */
function placeRafters(frames: readonly HallFrame[], section: HallSection): HallRafter[] {
  const eaveX = section.halfWidths.columnInner;
  const sides = section.roofType === 'mono' ? SIDES.filter(section.isLowSide) : SIDES;
  const topX = (side: Side) => (section.roofType === 'mono' ? -sign(side) * eaveX : 0);
  return frames.flatMap((frame) =>
    sides.map((side) => ({
      side,
      frame: frame.index,
      z: frame.z,
      from: [sign(side) * eaveX, section.rafterBottomY(sign(side) * eaveX)] as const,
      to: [topX(side), section.rafterBottomY(topX(side))] as const,
      length: section.rafterLength,
    })),
  );
}

/** Purlins run the whole length in one line, on past the end frames to the end walls, carrying the roof to its edge. */
function placePurlins(section: HallSection, ends: HallEnds): HallPurlin[] {
  const indexOnSide = new Map<Side, number>();
  return section.purlinSeats.map(({ side, x }) => {
    const index = indexOnSide.get(side) ?? 0;
    indexOnSide.set(side, index + 1);
    return { side, index, x, y: section.rafterTopY(x), zFrom: ends.frontInner, zTo: ends.backInner };
  });
}

/**
 * Gable: one plane per side, eave to ridge. Mono: one plane from the low eave to the high edge.
 * At a gutter eave the panel ends flush with the outer wall face, over the gutter's back edge, and drips straight
 * into it; its flashing (Trims.tsx) caps the panel's end. The verges and a mono roof's high edge overhang the walls.
 */
function placeRoof(section: HallSection, ends: HallEnds): RoofPlane[] {
  const { roofEdge: edgeX, wallOuter } = section.halfWidths;
  const zFront = ends.frontOuter + ROOF_OVERHANG;
  const zBack = ends.backOuter - ROOF_OVERHANG;
  const plane = (side: Side, topX: number): RoofPlane => {
    const eaveX = sign(side) * wallOuter;
    const slopeLength = Math.abs(topX - eaveX) / Math.cos(section.pitch);
    return {
      side,
      eave: [eaveX, section.roofUndersideY(eaveX)],
      ridge: [topX, section.roofUndersideY(topX)],
      thickness: section.panelThickness,
      plumbThickness: section.roofTopY(0) - section.roofUndersideY(0),
      zFront,
      zBack,
      slopeLength,
      area: slopeLength * (zFront - zBack),
    };
  };
  if (section.roofType === 'mono') {
    const low = otherSide(section.highSide);
    return [plane(low, sign(section.highSide) * edgeX)];
  }
  return SIDES.map((side) => plane(side, 0));
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

/**
 * A gutter under each low eave, hung on the outer wall face and as long as the roof above it, with a downpipe at both
 * ends of it.
 */
function placeRainwater(section: HallSection, ends: HallEnds): { gutters: HallGutter[]; downpipes: HallDownpipe[] } {
  const wallX = section.halfWidths.wallOuter;
  const sides = SIDES.filter(section.isLowSide);
  const gutters = sides.map((side) => ({
    side,
    x: sign(side) * wallX,
    y: section.roofUndersideY(sign(side) * wallX),
    zFrom: ends.frontOuter + ROOF_OVERHANG,
    zTo: ends.backOuter - ROOF_OVERHANG,
  }));
  const pipeEnds = [
    { end: 'front', z: ends.frontOuter - DOWNPIPE_END_INSET },
    { end: 'back', z: ends.backOuter + DOWNPIPE_END_INSET },
  ] as const;
  const downpipes = gutters.flatMap((gutter) =>
    pipeEnds.map(({ end, z }) => ({
      side: gutter.side,
      end,
      x: sign(gutter.side) * (wallX + GUTTER_WIDTH / 2),
      z,
      topY: gutter.y - DOWNPIPE_OUTLET_DROP,
      bottomY: DOWNPIPE_DISCHARGE_HEIGHT,
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
  const roof = placeRoof(section, ends);
  const { roofEdge, columnInner } = section.halfWidths;
  const mono = section.roofType === 'mono';
  const lowX = mono ? -sign(section.highSide) * columnInner : columnInner;
  const topX = mono ? sign(section.highSide) * columnInner : 0;
  const topEdgeX = mono ? sign(section.highSide) * roofEdge : 0;
  const columns = placeColumns(frames, section);

  return {
    params,
    pitch: section.pitch,
    roofType: section.roofType,
    highSide: mono ? section.highSide : null,
    bayCount,
    bay: params.length / bayCount,
    eaveY: section.rafterTopY(lowX),
    ridgeY: section.rafterTopY(topX),
    halfWidths: section.halfWidths,
    panelThickness: section.panelThickness,
    frames,
    columns,
    rafters: placeRafters(frames, section),
    rafterLength: section.rafterLength,
    purlins: placePurlins(section, ends),
    purlinsPerSide: section.purlinSeatXs.length,
    girtLevels: columns.find((c) => !c.isHigh)!.girtLevels,
    walls: computeWalls(section, ends, frames),
    roof,
    slab: placeSlab(section, ends),
    groundY: params.foundation ? -SLAB_THICKNESS : 0,
    ...placeRainwater(section, ends),
    bounds: {
      min: [-roofEdge, 0, roof[0].zBack],
      max: [roofEdge, section.roofTopY(topEdgeX), roof[0].zFront],
    },
  };
}
