/**
 * Wall descriptors: the exterior face of each of the four walls, in a form openings, markers, pricing and the
 * procedural wall meshes can all consume. See `WallDescriptor` in types.ts for the (h, v) convention.
 *
 * Corners: the gable (end) walls run the full outer width; the side walls fit between their inner faces.
 */
import { COLUMN_DEPTH, FRAME_FLANGE_WIDTH } from './constants';
import type { HallSection } from './section';
import type { HallFrame, Vec2, Vec3, WallDescriptor, WallKey } from './types';

/** Z of the cladding faces at both ends of the hall. */
export interface HallEnds {
  frontInner: number;
  frontOuter: number;
  backInner: number;
  backOuter: number;
}

const UP: Vec3 = [0, 1, 0];

/** Area of a simple polygon (shoelace formula). */
export function polygonArea(points: readonly Vec2[]): number {
  const twice = points.reduce((sum, [h, v], i) => {
    const [nextH, nextV] = points[(i + 1) % points.length];
    return sum + h * nextV - nextH * v;
  }, 0);
  return Math.abs(twice) / 2;
}

/** World position of the point (h, v) on a wall's exterior face, pushed `out` metres along its normal. */
export function wallPointToWorld(wall: WallDescriptor, h: number, v: number, out = 0): Vec3 {
  const { origin, axisH, axisV, normal } = wall;
  return [
    origin[0] + h * axisH[0] + v * axisV[0] + out * normal[0],
    origin[1] + h * axisH[1] + v * axisV[1] + out * normal[1],
    origin[2] + h * axisH[2] + v * axisV[2] + out * normal[2],
  ];
}

/** Height of the wall face at `h`: the eave height on side walls, rising to the apex on gables. */
export function wallHeightAt(wall: WallDescriptor, h: number): number {
  const half = wall.spanH / 2;
  const towardsApex = 1 - Math.min(1, Math.abs(h - half) / half);
  return wall.spanV + (wall.apexV - wall.spanV) * towardsApex;
}

export function computeWalls(
  section: HallSection,
  ends: HallEnds,
  frames: readonly HallFrame[],
): Record<WallKey, WallDescriptor> {
  const { wallOuter, columnAxis } = section.halfWidths;
  const eaveV = section.roofUndersideY(wallOuter);
  const apexV = section.roofUndersideY(0);
  const thickness = section.panelThickness;

  const gableSpan = 2 * wallOuter;
  const gablePolygon: Vec2[] = [
    [0, 0],
    [gableSpan, 0],
    [gableSpan, eaveV],
    [gableSpan / 2, apexV],
    [0, eaveV],
  ];
  const gable = {
    axisV: UP,
    spanH: gableSpan,
    spanV: eaveV,
    apexV,
    thickness,
    polygon: gablePolygon,
    area: polygonArea(gablePolygon),
    supports: [wallOuter - columnAxis, wallOuter + columnAxis],
    supportHalfWidth: COLUMN_DEPTH / 2,
  };

  const sideSpan = ends.frontInner - ends.backInner;
  const sidePolygon: Vec2[] = [
    [0, 0],
    [sideSpan, 0],
    [sideSpan, eaveV],
    [0, eaveV],
  ];
  const side = {
    axisH: [0, 0, -1] as Vec3,
    axisV: UP,
    spanH: sideSpan,
    spanV: eaveV,
    apexV: eaveV,
    thickness,
    polygon: sidePolygon,
    area: polygonArea(sidePolygon),
    supports: frames.map((frame) => ends.frontInner - frame.z),
    supportHalfWidth: FRAME_FLANGE_WIDTH / 2,
  };

  return {
    front: {
      key: 'front',
      id: 'PereteFata',
      origin: [-wallOuter, 0, ends.frontOuter],
      axisH: [1, 0, 0],
      normal: [0, 0, 1],
      yaw: 0,
      ...gable,
    },
    back: {
      key: 'back',
      id: 'PereteSpate',
      origin: [wallOuter, 0, ends.backOuter],
      axisH: [-1, 0, 0],
      normal: [0, 0, -1],
      yaw: Math.PI,
      ...gable,
    },
    left: {
      key: 'left',
      id: 'PereteSTG',
      origin: [-wallOuter, 0, ends.frontInner],
      normal: [-1, 0, 0],
      yaw: -Math.PI / 2,
      ...side,
    },
    right: {
      key: 'right',
      id: 'PereteDR',
      origin: [wallOuter, 0, ends.frontInner],
      normal: [1, 0, 0],
      yaw: Math.PI / 2,
      ...side,
    },
  };
}
