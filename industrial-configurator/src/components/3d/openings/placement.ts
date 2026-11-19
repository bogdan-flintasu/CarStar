// Placement preview (T1b): where a new opening would go for a pointer on a wall, the band (bay) it settles into and
// whether it fits there. Pure: no React, three or zustand, so the rules are unit-tested in node.
//
// - Side walls: the item settles into the centre of the bay under the pointer.
// - End walls: it centres on the wall's axis when the pointer is near it, else follows the pointer on a 0.1 m grid.
// - Free placement (snapping off): it follows the pointer on the grid everywhere.
// - Windows follow the pointer vertically (0.1 m grid); doors stand on the floor.

import { anchorFromRect, baysOf, bayIndexAt, faceStretch, placeOpening, wallKindOf } from './anchors';
import { DEFAULT_DIMENSIONS, isFloorStanding } from './openingMath';
import type { Opening, OpeningAnchor, OpeningRect, OpeningType, WallBay, WallId, WallSpan } from './types';
import { validateOpenings } from './validateOpenings';

/** MIME type of a type card dragged from the panel onto a wall (`ClosingsStep` -> `PlacementPreview`). */
export const OPENING_DRAG_TYPE = 'application/x-carstar-opening';

/** Placement grid for free positions, metres. */
export const PLACEMENT_GRID = 0.1;
/** On an end wall, a pointer within this distance of the axis centres the item on it. */
export const AXIS_CAPTURE = 0.3;
const EPS = 1e-6;
const PREVIEW_ID = '__preview__';

/** Why the preview does not fit: shown as the red band's tooltip / label. */
export type NoFitReason = 'width' | 'slope' | 'overlap' | 'column' | 'blocker';

export interface PlacementPreview {
  type: OpeningType;
  wallId: WallId;
  /** The rectangle a click would add (already clamped to the wall). */
  rect: OpeningRect;
  /** The anchor the store will derive from `rect` (bay centre, axis, wall start). */
  anchor: OpeningAnchor;
  /** The band highlighted along the wall: the bay on a side wall, the stretch between gable columns on an end wall. */
  band: WallBay;
  /** Side walls: index of the bay under the pointer (0 = front). Null on end walls. */
  bayIndex: number | null;
  fits: boolean;
  reason: NoFitReason | null;
  /** The placement is free (anchored to the wall start). */
  free: boolean;
}

const grid = (v: number) => Math.round(v / PLACEMENT_GRID) * PLACEMENT_GRID;
const mm = (v: number) => Math.round(v * 1000) / 1000;

/** Stretches of an end wall between its columns (the whole wall when it has none). */
export function endWallSegments(span: WallSpan): WallBay[] {
  const cuts = [...new Set([0, ...(span.supports ?? []).filter((h) => h > EPS && h < span.length - EPS), span.length])]
    .sort((a, b) => a - b);
  return cuts.slice(1).map((h1, i) => ({ h0: cuts[i], h1 }));
}

/** The band of the wall under `h`: its bay (side walls) or its stretch between columns (end walls). */
export function bandAt(h: number, span: WallSpan, wallId: WallId): { band: WallBay; bayIndex: number | null } {
  if (wallKindOf(wallId) === 'side') {
    const bays = baysOf(span);
    const i = bayIndexAt(h, bays);
    return { band: bays[i], bayIndex: i };
  }
  const segments = endWallSegments(span);
  return { band: segments[bayIndexAt(h, segments)], bayIndex: null };
}

/**
 * Whether `rect` (of `type`) fits on its wall next to `others` (openings already placed; any wall, only `wallId`'s are
 * used): it must fit where its anchor puts it (bay width, the face under a slope) and clash with no opening, column or
 * downpipe.
 */
export function fitsAt(
  type: OpeningType,
  wallId: WallId,
  rect: OpeningRect,
  span: WallSpan,
  others: readonly Opening[],
  opts: { free?: boolean } = {},
): { fits: boolean; reason: NoFitReason | null; anchor: OpeningAnchor } {
  const anchor = anchorFromRect(rect, span, wallKindOf(wallId), opts);
  const placed = placeOpening({ type, anchor, sill: rect.sill, width: rect.width, height: rect.height }, span);
  if (!placed.fits) {
    const { lo, hi } = faceStretch(span, rect.sill + rect.height);
    const underSlope = hi - lo < rect.width - EPS || rect.offsetX < lo - EPS || rect.offsetX + rect.width > hi + EPS;
    return { fits: false, reason: underSlope && rect.width <= span.length ? 'slope' : 'width', anchor };
  }
  const me: Opening = { id: PREVIEW_ID, type, wallId, ...placed.rect };
  const sameWall = others.filter((o) => o.wallId === wallId);
  const kinds = new Set(
    validateOpenings([...sameWall, me], { [wallId]: span } as Record<WallId, WallSpan>)
      .filter((c) => c.openingId === PREVIEW_ID)
      .map((c) => c.kind),
  );
  const reason: NoFitReason | null = kinds.has('overlap')
    ? 'overlap'
    : kinds.has('support')
      ? 'column'
      : kinds.has('blocker')
        ? 'blocker'
        : null;
  return { fits: reason === null, reason, anchor };
}

export interface PreviewInput {
  type: OpeningType;
  wallId: WallId;
  /** Pointer on the wall face, metres along the wall and up. */
  h: number;
  v: number;
  span: WallSpan;
  /** Every placed opening (only those on `wallId` matter). */
  others: readonly Opening[];
  /** Snapping off: follow the pointer, anchor to the wall start. */
  free?: boolean;
  /** Size of the item; the type's default size when omitted. */
  size?: { width: number; height: number };
}

/** The rectangle the pointer asks for, before checking whether it fits. */
export function previewRect(input: PreviewInput): OpeningRect {
  const { type, wallId, h, v, span, free } = input;
  const { width, height } = input.size ?? DEFAULT_DIMENSIONS[type];
  let left = grid(h - width / 2);
  const sill = isFloorStanding(type) ? 0 : grid(v - height / 2);
  if (!free) {
    if (wallKindOf(wallId) === 'side') {
      const { band } = bandAt(h, span, wallId);
      left = (band.h0 + band.h1) / 2 - width / 2;
    } else if (Math.abs(h - span.length / 2) <= AXIS_CAPTURE) {
      left = span.length / 2 - width / 2;
    }
  }
  // Keep it on the wall (ends, floor, top), never resized: whether it fits there is `fitsAt`'s call.
  const maxTop = Math.max(span.height, span.apex ?? 0);
  const offsetX = Math.min(Math.max(0, left), Math.max(0, span.length - width));
  return { offsetX: mm(offsetX), sill: mm(Math.min(Math.max(0, sill), Math.max(0, maxTop - height))), width, height };
}

/** The preview for a pointer at (h, v) on a wall. */
export function previewAt(input: PreviewInput): PlacementPreview {
  const rect = previewRect(input);
  const free = input.free ?? false;
  const { band, bayIndex } = bandAt(input.h, input.span, input.wallId);
  const { fits, reason, anchor } = fitsAt(input.type, input.wallId, rect, input.span, input.others, { free });
  return { type: input.type, wallId: input.wallId, rect, anchor, band, bayIndex, fits, reason, free };
}

/** Short Romanian label for the reason (the red band always says "nu încape"; this is the detail). */
export const NO_FIT_LABEL: Record<NoFitReason, string> = {
  width: 'prea lat',
  slope: 'sub pantă',
  overlap: 'suprapunere',
  column: 'peste stâlp',
  blocker: 'burlan',
};
