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

/**
 * Height of a wall face at `h`: it rises linearly from `spanV` at both ends to `apexV` at `apexH` (the middle of a
 * gable, one end of a mono-pitch end wall; flat on side walls). `apexH` defaults to the middle.
 */
export function faceHeightAt(
  wall: Pick<WallDescriptor, 'spanH' | 'spanV' | 'apexV'> & { apexH?: number },
  h: number,
): number {
  const apexH = wall.apexH ?? wall.spanH / 2;
  const towardsApex =
    h <= apexH
      ? apexH > 0
        ? Math.max(0, h / apexH)
        : 1
      : apexH < wall.spanH
        ? Math.max(0, (wall.spanH - h) / (wall.spanH - apexH))
        : 1;
  return wall.spanV + (wall.apexV - wall.spanV) * Math.min(1, towardsApex);
}

/** Height of the wall face at `h`: the eave height on side walls, rising to the apex on end walls. */
export function wallHeightAt(wall: WallDescriptor, h: number): number {
  return faceHeightAt(wall, h);
}

export function computeWalls(
  section: HallSection,
  ends: HallEnds,
  frames: readonly HallFrame[],
): Record<WallKey, WallDescriptor> {
  const { wallOuter, columnAxis } = section.halfWidths;
  const thickness = section.panelThickness;
  /** Top of the cladding (the roof's underside) above a point of the outer wall line. */
  const topAt = (x: number) => section.roofUndersideY(x);
  const leftV = topAt(-wallOuter);
  const rightV = topAt(wallOuter);
  const eaveV = Math.min(leftV, rightV);

  // End walls run the full outer width. h runs +X on the front wall and -X on the back wall.
  const gableSpan = 2 * wallOuter;
  const endWall = (startV: number, endV: number) => {
    const polygon: Vec2[] =
      section.roofType === 'mono'
        ? [
            [0, 0],
            [gableSpan, 0],
            [gableSpan, endV],
            [0, startV],
          ]
        : [
            [0, 0],
            [gableSpan, 0],
            [gableSpan, eaveV],
            [gableSpan / 2, topAt(0)],
            [0, eaveV],
          ];
    const apexV = section.roofType === 'mono' ? Math.max(startV, endV) : topAt(0);
    return {
      axisV: UP,
      spanH: gableSpan,
      spanV: eaveV,
      apexV,
      apexH: section.roofType === 'mono' ? (endV > startV ? gableSpan : 0) : gableSpan / 2,
      thickness,
      polygon,
      area: polygonArea(polygon),
      supports: [wallOuter - columnAxis, wallOuter + columnAxis],
      supportHalfWidth: COLUMN_DEPTH / 2,
    };
  };

  // Side walls fit between the end walls' inner faces; each is as high as the roof above it.
  const sideSpan = ends.frontInner - ends.backInner;
  const sideWall = (v: number) => {
    const polygon: Vec2[] = [
      [0, 0],
      [sideSpan, 0],
      [sideSpan, v],
      [0, v],
    ];
    return {
      axisH: [0, 0, -1] as Vec3,
      axisV: UP,
      spanH: sideSpan,
      spanV: v,
      apexV: v,
      apexH: sideSpan / 2,
      thickness,
      polygon,
      area: polygonArea(polygon),
      supports: frames.map((frame) => ends.frontInner - frame.z),
      supportHalfWidth: FRAME_FLANGE_WIDTH / 2,
    };
  };

  return {
    front: {
      key: 'front',
      id: 'PereteFata',
      origin: [-wallOuter, 0, ends.frontOuter],
      axisH: [1, 0, 0],
      normal: [0, 0, 1],
      yaw: 0,
      ...endWall(leftV, rightV),
    },
    back: {
      key: 'back',
      id: 'PereteSpate',
      origin: [wallOuter, 0, ends.backOuter],
      axisH: [-1, 0, 0],
      normal: [0, 0, -1],
      yaw: Math.PI,
      ...endWall(rightV, leftV),
    },
    left: {
      key: 'left',
      id: 'PereteSTG',
      origin: [-wallOuter, 0, ends.frontInner],
      normal: [-1, 0, 0],
      yaw: -Math.PI / 2,
      ...sideWall(leftV),
    },
    right: {
      key: 'right',
      id: 'PereteDR',
      origin: [wallOuter, 0, ends.frontInner],
      normal: [1, 0, 0],
      yaw: Math.PI / 2,
      ...sideWall(rightV),
    },
  };
}
