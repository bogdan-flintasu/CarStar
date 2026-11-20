// "Repetă" (T1d): copies of a side-wall opening along its wall. Pure: no React, three or zustand.
//
// - every bay ("În fiecare travee"), every second bay counted from the item's bay ("La fiecare a doua travee"): the
//   copies take the item's offset in the bay (a centred item gives centred copies);
// - N pieces evenly spaced ("N bucăți, egal distanțate"): N items in all, centred at L·(k + ½)/N along the wall; the
//   selected item moves to the slot nearest to it, the other slots get copies.
// Slots where a copy does not fit (too wide for the bay, across a column, overlapping another item, a downpipe) are
// skipped and counted.

import { anchorFromRect, baysOf, bayIndexAt, wallKindOf } from './anchors';
import { bayOffsetOf, freeSpot, type NewIntent } from './copyPaste';
import { isFloorStanding } from './openingMath';
import type { Opening, OpeningAnchor, OpeningIntent, OpeningRect, WallSpan } from './types';

export type RepeatPattern = { kind: 'every' } | { kind: 'everySecond' } | { kind: 'count'; n: number };

/** Most pieces "N bucăți" accepts. */
export const REPEAT_MAX_COUNT = 50;

export interface RepeatPlan {
  /** Copies to add, in wall order. */
  add: NewIntent[];
  /** "N bucăți": the new anchor of the selected item (its slot), or undefined when it stays. */
  move?: OpeningAnchor;
  /** Slots where a copy did not fit. */
  skipped: number;
}

const mm = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The copies "Repetă" adds for `source` (placed as `sourceRect`), next to `placed` (every placed opening, the source
 * included). Null when the source is not on a side wall.
 */
export function planRepeat(
  source: OpeningIntent,
  sourceRect: OpeningRect,
  pattern: RepeatPattern,
  placed: readonly Opening[],
  span: WallSpan,
): RepeatPlan | null {
  if (wallKindOf(source.wallId) !== 'side') return null;
  const sill = isFloorStanding(source.type) ? 0 : source.sill;
  const base = { type: source.type, wallId: source.wallId, sill, width: source.width, height: source.height };
  const bays = baysOf(span);
  const add: NewIntent[] = [];
  let skipped = 0;

  if (pattern.kind === 'every' || pattern.kind === 'everySecond') {
    const from = bayIndexAt(sourceRect.offsetX + sourceRect.width / 2, bays);
    const offset = bayOffsetOf({ ...sourceRect, anchor: source.anchor }, span);
    const step = pattern.kind === 'every' ? 1 : 2;
    const taken = [...placed];
    for (let bay = 0; bay < bays.length; bay++) {
      if (bay === from || Math.abs(bay - from) % step !== 0) continue;
      const candidate: NewIntent = { ...base, anchor: { kind: 'bay', bay, offset } };
      const rect = freeSpot(candidate, taken, span);
      if (!rect) {
        skipped++;
        continue;
      }
      add.push(candidate);
      taken.push({ id: `__repeat_${bay}__`, ...base, ...rect });
    }
    return { add, skipped };
  }

  const n = Math.min(REPEAT_MAX_COUNT, Math.max(1, Math.floor(pattern.n)));
  const slots: OpeningRect[] = [];
  for (let k = 0; k < n; k++) {
    const centre = (span.length * (k + 0.5)) / n;
    slots.push({ offsetX: mm(centre - source.width / 2), sill, width: source.width, height: source.height });
  }
  const sourceCentre = sourceRect.offsetX + sourceRect.width / 2;
  const own = slots.reduce(
    (best, s, i) =>
      Math.abs(s.offsetX + s.width / 2 - sourceCentre) < Math.abs(slots[best].offsetX + slots[best].width / 2 - sourceCentre)
        ? i
        : best,
    0,
  );
  const others = placed.filter((o) => o.id !== source.id);
  const taken: Opening[] = [...others];
  let move: OpeningAnchor | undefined;

  // The selected item's slot first: it stays where it is when its slot does not fit.
  const ownAnchor = anchorFromRect(slots[own], span, 'side');
  if (freeSpot({ ...base, anchor: ownAnchor }, others, span)) {
    move = ownAnchor;
    taken.push({ id: source.id, ...base, ...slots[own] });
  } else {
    skipped++;
    taken.push({ id: source.id, ...base, ...sourceRect });
  }
  slots.forEach((slot, i) => {
    if (i === own) return;
    const candidate: NewIntent = { ...base, anchor: anchorFromRect(slot, span, 'side') };
    const rect = freeSpot(candidate, taken, span);
    if (!rect) {
      skipped++;
      return;
    }
    add.push(candidate);
    taken.push({ id: `__repeat_${i}__`, ...base, ...rect });
  });
  return { add, move, skipped };
}
