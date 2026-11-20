// Copy, paste and duplicate (T1d): where a copy of an opening goes. Pure: no React, three or zustand.
//
// - Side walls: the next free bay after the reference one (towards the back, then wrapping to the front), same offset
//   in the bay (a centred item stays centred), same type, size and sill.
// - End walls (and side walls without frames): the next free spot to the right of the reference along the wall,
//   then from the wall start; anchored on the wall axis like any end-wall item.
// - "Free" = fits where its anchor puts it (bay width, the face under a slope) and clashes with no other opening,
//   column or downpipe of that wall. None free -> null ("Nu mai este loc pe acest perete").

import { anchorFromRect, baysOf, bayIndexAt, placeOpening, wallKindOf } from './anchors';
import { isFloorStanding } from './openingMath';
import type { Opening, OpeningAnchor, OpeningIntent, OpeningRect, OpeningType, WallId, WallSpan } from './types';
import { validateOpenings } from './validateOpenings';

/** What a copy keeps of its source. */
export interface CopyTemplate {
  type: OpeningType;
  width: number;
  height: number;
  sill: number;
}

/** The copied opening (Ctrl/⌘+C): its template and where the source was. */
export interface OpeningClipboard extends CopyTemplate {
  wallId: WallId;
  anchor: OpeningAnchor;
}

/** A new intent without an id (the store gives it one). */
export type NewIntent = Omit<OpeningIntent, 'id'>;

/** Gap kept between the reference and a copy placed along an end wall, metres. */
export const COPY_GAP = 0.5;
/** Step of the search along an end wall, metres. */
export const COPY_SEARCH_STEP = 0.05;
const EPS = 1e-6;
const CANDIDATE_ID = '__copy__';
const mm = (v: number) => Math.round(v * 1000) / 1000;

export function clipboardOf(intent: OpeningIntent): OpeningClipboard {
  return {
    type: intent.type,
    wallId: intent.wallId,
    anchor: intent.anchor,
    width: intent.width,
    height: intent.height,
    sill: isFloorStanding(intent.type) ? 0 : intent.sill,
  };
}

/**
 * Whether `candidate` is a valid spot on its wall next to `placed` (openings already placed; any wall, only the
 * candidate's wall is used): it fits at its anchor and clashes with nothing. Returns its rectangle when valid.
 */
export function freeSpot(candidate: NewIntent, placed: readonly Opening[], span: WallSpan): OpeningRect | null {
  const p = placeOpening(candidate, span);
  if (!p.fits) return null;
  const me: Opening = { id: CANDIDATE_ID, type: candidate.type, wallId: candidate.wallId, ...p.rect };
  const sameWall = placed.filter((o) => o.wallId === candidate.wallId);
  const clash = validateOpenings([...sameWall, me], { [candidate.wallId]: span } as Record<WallId, WallSpan>).some(
    (c) => c.openingId === CANDIDATE_ID,
  );
  return clash ? null : p.rect;
}

/** The offset of `ref` in its bay (side walls): its anchor's when it has a bay anchor, else measured from the rect. */
export function bayOffsetOf(ref: OpeningRect & { anchor?: OpeningAnchor }, span: WallSpan): 'centre' | number {
  if (ref.anchor?.kind === 'bay') return ref.anchor.offset;
  const a = anchorFromRect(ref, span, 'side');
  return a.kind === 'bay' ? a.offset : 'centre';
}

/**
 * The next free spot for a copy of `template` on `wallId`, after `ref` (a rectangle on that wall: the selected item or
 * the copied one). Side walls with bays: the next free bay after `ref`'s, wrapping around. End walls: the next free
 * spot to the right of `ref`, then from the wall start. Null when the wall has no free spot.
 */
export function nextFreeSpot(
  template: CopyTemplate,
  wallId: WallId,
  ref: OpeningRect & { anchor?: OpeningAnchor },
  placed: readonly Opening[],
  span: WallSpan,
): NewIntent | null {
  const sill = isFloorStanding(template.type) ? 0 : template.sill;
  const base = { type: template.type, wallId, sill, width: template.width, height: template.height };
  const bays = baysOf(span);

  if (wallKindOf(wallId) === 'side' && bays.length > 1) {
    const from = bayIndexAt(ref.offsetX + ref.width / 2, bays);
    const offset = bayOffsetOf(ref, span);
    for (let k = 1; k < bays.length; k++) {
      const bay = (from + k) % bays.length;
      const candidate: NewIntent = { ...base, anchor: { kind: 'bay', bay, offset } };
      if (freeSpot(candidate, placed, span)) return candidate;
    }
    return null;
  }

  // Along the wall: right of the reference first, then from the start up to it.
  const maxLeft = span.length - template.width;
  if (maxLeft < -EPS) return null;
  const startRight = ref.offsetX + ref.width + COPY_GAP;
  const lefts: number[] = [];
  for (let x = startRight; x <= maxLeft + EPS; x += COPY_SEARCH_STEP) lefts.push(x);
  for (let x = 0; x < startRight - EPS && x <= maxLeft + EPS; x += COPY_SEARCH_STEP) lefts.push(x);
  for (const left of lefts) {
    const rect: OpeningRect = { offsetX: mm(Math.min(left, maxLeft)), sill, width: template.width, height: template.height };
    const candidate: NewIntent = { ...base, anchor: anchorFromRect(rect, span, wallKindOf(wallId)) };
    if (freeSpot(candidate, placed, span)) return candidate;
  }
  return null;
}
