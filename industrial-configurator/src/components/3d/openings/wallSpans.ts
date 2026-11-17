// Wall geometry for openings comes from D1's `layout.walls` (E6). This module only builds a layout from the
// configurator state; the maths lives in `validateOpenings.ts` (`wallSpansFromLayout`).

import { clampHallDimensions, computeHallLayout } from '@/lib/hall';
import type { HallLayout, RoofType, Side } from '@/lib/hall';
import { wallSpansFromLayout } from './validateOpenings';
import type { WallSpans } from './types';

export { wallSpansFromLayout };

/** The configurator state that shapes the hall (same fields the engine feeds to `computeHallLayout`). */
export interface HallState {
  width: number;
  height: number;
  length: number;
  showFoundation?: boolean;
  isIsolated?: boolean;
  insulation?: number;
  roofType?: RoofType;
  highSide?: Side;
}

export function layoutFromHallState(s: HallState): HallLayout {
  return computeHallLayout({
    ...clampHallDimensions({ width: s.width, height: s.height, length: s.length }),
    foundation: s.showFoundation ?? true,
    panels: s.isIsolated ?? false,
    insulationMm: s.insulation ?? 30,
    roofType: s.roofType,
    highSide: s.highSide,
  });
}

export function spansFromHallState(s: HallState): WallSpans {
  return wallSpansFromLayout(layoutFromHallState(s));
}
