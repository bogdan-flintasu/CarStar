// Wall rectangles in world space for the current (GLB-based) hall.
// TEMPORARY: these magic numbers mirror Configurator.tsx and will be replaced by D1's
// `layout.walls` in E6. Keep every consumer going through this module so E6 is a one-file swap.

import type { WallId, WallSpans } from './types';

const THRESHOLD = 12;

/** Offsets that make openings sit flush on the exterior face of the GLTF panels. */
const FRONT_BACK_WALL_OFFSET = 0.048;
const SIDE_WALL_OFFSET = 0.44;

function computePullMain(width: number): number {
  if (width > THRESHOLD) return (width - THRESHOLD) * 0.484;
  return -(THRESHOLD - width) * 0.487;
}

export interface WallDescriptor {
  wallId: WallId;
  /** World position of the wall's bottom-left corner (wall start, floor level, exterior face). */
  originX: number;
  originY: number;
  originZ: number;
  /** Unit vector along the wall (direction of increasing `offsetX`). */
  axisH: [number, number, number];
  /** Outward-facing normal. */
  normal: [number, number, number];
  /** Wall length in metres. */
  spanH: number;
  /** Wall height in metres. */
  spanV: number;
}

export function getWallDescriptors(w: number, h: number, l: number): WallDescriptor[] {
  const halfStruct = 6 + computePullMain(w);
  return [
    {
      wallId: 'PereteFata',
      originX: -halfStruct, originY: 0, originZ: FRONT_BACK_WALL_OFFSET,
      axisH: [1, 0, 0], normal: [0, 0, 1],
      spanH: halfStruct * 2, spanV: h,
    },
    {
      wallId: 'PereteSpate',
      originX: halfStruct, originY: 0, originZ: -l - FRONT_BACK_WALL_OFFSET,
      axisH: [-1, 0, 0], normal: [0, 0, -1],
      spanH: halfStruct * 2, spanV: h,
    },
    {
      wallId: 'PereteSTG',
      originX: -halfStruct - SIDE_WALL_OFFSET, originY: 0, originZ: 0,
      axisH: [0, 0, -1], normal: [-1, 0, 0],
      spanH: l, spanV: h,
    },
    {
      wallId: 'PereteDR',
      originX: halfStruct + SIDE_WALL_OFFSET, originY: 0, originZ: 0,
      axisH: [0, 0, -1], normal: [1, 0, 0],
      spanH: l, spanV: h,
    },
  ];
}

export function getWallDescriptor(wallId: WallId, w: number, h: number, l: number): WallDescriptor {
  return getWallDescriptors(w, h, l).find((d) => d.wallId === wallId)!;
}

export function getWallSpans(w: number, h: number, l: number): WallSpans {
  const spans = {} as WallSpans;
  for (const d of getWallDescriptors(w, h, l)) spans[d.wallId] = { length: d.spanH, height: d.spanV };
  return spans;
}
