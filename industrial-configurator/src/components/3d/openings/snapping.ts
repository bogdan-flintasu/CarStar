// Snapping (T1c): while an opening is dragged or previewed it is pulled, within `SNAP_DISTANCE`, onto
// - the centre of the bay it is in (side walls),
// - the middle of the wall (unless a column stands there),
// - an equal gap between its neighbours (between two of them, or repeating the gap of the next pair),
// - the sill height of another window on the same wall (windows only).
// Each snap returns a guide for the 3D view. `free` (Alt / ⌥ held, or "Aliniere" off) skips all of it: the result is a
// free placement, anchored to the wall start. Pure: no React, three or zustand.

import { anchorFromRect, baysOf, bayIndexAt, wallKindOf } from './anchors';
import type { Opening, OpeningAnchor, OpeningRect, OpeningType, WallBay, WallId, WallKind, WallSpan } from './types';

/** Snap distance, metres. */
export const SNAP_DISTANCE = 0.3;
const EPS = 1e-6;

/** A thin line drawn on the wall while a snap holds. Coordinates are the wall's (h along, v up), metres. */
export type SnapGuide =
  /** Vertical line through the centre of the bay. */
  | { kind: 'bayCentre'; h: number }
  /** Vertical line through the middle of the wall. */
  | { kind: 'wallCentre'; h: number }
  /** Horizontal line at the shared sill height, from `h0` to `h1`. */
  | { kind: 'sill'; v: number; h0: number; h1: number }
  /** The equal gaps, as horizontal segments at height `v`. */
  | { kind: 'equalGap'; v: number; gaps: WallBay[] };

export type SnapGuideKind = SnapGuide['kind'];

/** Another opening on the same wall: its type matters for sill snapping (windows only). */
export type SnapNeighbour = Pick<Opening, 'type' | 'offsetX' | 'sill' | 'width' | 'height'>;

export interface SnapOptions {
  type: OpeningType;
  wallKind: WallKind;
  /** Snap distance; `SNAP_DISTANCE` by default. */
  threshold?: number;
  /** Snapping off (Alt / ⌥, or the "Aliniere" switch): the candidate is returned as is. */
  free?: boolean;
}

export interface SnapResult {
  rect: OpeningRect;
  guides: SnapGuide[];
  /** The placement is free: anchor it to the wall start. */
  free: boolean;
}

interface Target {
  left: number;
  guide: SnapGuide;
  /** Lower wins on equal distance. */
  rank: number;
}

const right = (r: Pick<OpeningRect, 'offsetX' | 'width'>) => r.offsetX + r.width;
const centre = (r: Pick<OpeningRect, 'offsetX' | 'width'>) => r.offsetX + r.width / 2;
const mm = (v: number) => Math.round(v * 1000) / 1000;

/** Horizontal targets for `c` on the wall, as left edges. */
function horizontalTargets(c: OpeningRect, span: WallSpan, others: readonly SnapNeighbour[], opts: SnapOptions): Target[] {
  const out: Target[] = [];
  const w = c.width;
  const v = c.sill + c.height / 2;

  if (opts.wallKind === 'side') {
    const bays = baysOf(span);
    const bay = bays[bayIndexAt(centre(c), bays)];
    const h = (bay.h0 + bay.h1) / 2;
    out.push({ left: h - w / 2, guide: { kind: 'bayCentre', h }, rank: 0 });
  }
  out.push({ left: span.length / 2 - w / 2, guide: { kind: 'wallCentre', h: span.length / 2 }, rank: 1 });

  // Neighbours left and right of the candidate's centre, nearest first.
  const cc = centre(c);
  const leftSide = others.filter((o) => centre(o) < cc).sort((a, b) => right(b) - right(a));
  const rightSide = others.filter((o) => centre(o) >= cc).sort((a, b) => a.offsetX - b.offsetX);
  const [a, a2] = leftSide;
  const [b, b2] = rightSide;

  if (a && b) {
    const left = (right(a) + b.offsetX - w) / 2;
    if (left >= right(a) - EPS && left + w <= b.offsetX + EPS) {
      out.push({ left, guide: { kind: 'equalGap', v, gaps: [{ h0: right(a), h1: left }, { h0: left + w, h1: b.offsetX }] }, rank: 2 });
    }
  }
  if (a && a2 && a.offsetX >= right(a2) - EPS) {
    const gap = a.offsetX - right(a2);
    const left = right(a) + gap;
    out.push({ left, guide: { kind: 'equalGap', v, gaps: [{ h0: right(a2), h1: a.offsetX }, { h0: right(a), h1: left }] }, rank: 2 });
  }
  if (b && b2 && b2.offsetX >= right(b) - EPS) {
    const gap = b2.offsetX - right(b);
    const left = b.offsetX - gap - w;
    out.push({ left, guide: { kind: 'equalGap', v, gaps: [{ h0: left + w, h1: b.offsetX }, { h0: right(b), h1: b2.offsetX }] }, rank: 2 });
  }
  // Never pull an item onto a column (e.g. the middle of a side wall with an even number of bays is a frame).
  const half = span.supportHalfWidth ?? 0;
  const crossesColumn = (left: number) =>
    (span.supports ?? []).some((h) => left < h + half - EPS && h - half < left + w - EPS);
  return out.filter((t) => !crossesColumn(t.left));
}

/** The nearest target within the threshold (ties: bay centre, wall middle, equal gaps). */
function nearest<T extends { rank: number }>(targets: readonly T[], distance: (t: T) => number, threshold: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const d = distance(t);
    if (d > threshold + EPS) continue;
    if (d < bestD - EPS || (Math.abs(d - bestD) <= EPS && best && t.rank < best.rank)) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * Snaps a candidate rectangle on its wall. `others`: the other openings on the same wall (not the one being moved).
 * Horizontal and vertical snaps are independent; each that holds adds its guide.
 */
export function snap(candidate: OpeningRect, span: WallSpan, others: readonly SnapNeighbour[], opts: SnapOptions): SnapResult {
  if (opts.free) return { rect: { ...candidate }, guides: [], free: true };
  const threshold = opts.threshold ?? SNAP_DISTANCE;
  const rect = { ...candidate };
  const guides: SnapGuide[] = [];

  const h = nearest(horizontalTargets(candidate, span, others, opts), (t) => Math.abs(t.left - candidate.offsetX), threshold);
  if (h) {
    rect.offsetX = mm(h.left);
    guides.push(h.guide);
  }

  if (opts.type === 'window') {
    const windows = others.filter((o) => o.type === 'window');
    const s = nearest(
      windows.map((o) => ({ o, rank: 0 })),
      (t) => Math.abs(t.o.sill - candidate.sill),
      threshold,
    );
    if (s) {
      rect.sill = s.o.sill;
      const h0 = Math.min(rect.offsetX, s.o.offsetX);
      const h1 = Math.max(right(rect), right(s.o));
      guides.push({ kind: 'sill', v: s.o.sill, h0, h1 });
    }
  }
  return { rect, guides, free: false };
}

// ─── Centre buttons ───────────────────────────────────────────────────────────

/** "Centrează în travee": centred in the bay holding the opening's centre (side walls only; null elsewhere). */
export function centreInBayAnchor(rect: OpeningRect, span: WallSpan, wallId: WallId): OpeningAnchor | null {
  if (wallKindOf(wallId) !== 'side') return null;
  return { kind: 'bay', bay: bayIndexAt(centre(rect), baysOf(span)), offset: 'centre' };
}

/**
 * "Centrează pe perete": centred on the wall. End walls: on the axis. Side walls: the bay anchor of a rectangle
 * centred on the wall (a bay centre when the middle of the wall is one).
 */
export function centreOnWallAnchor(rect: OpeningRect, span: WallSpan, wallId: WallId): OpeningAnchor {
  if (wallKindOf(wallId) === 'end') return { kind: 'axis', fromCentre: 0 };
  return anchorFromRect({ ...rect, offsetX: span.length / 2 - rect.width / 2 }, span, 'side');
}
