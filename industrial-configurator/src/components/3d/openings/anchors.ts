// Opening anchors (T1a): the user's intent (bay / wall axis / wall start) and the placed rectangle derived from it.
// Pure: no React, three or zustand, so every rule here is unit-tested in node.
//
// The rules on a change of the hall:
// - a side-wall opening keeps its bay (and its offset in it); when that bay no longer exists it moves to the nearest
//   free bay of the same wall;
// - an end-wall opening keeps its distance from the wall's centre line;
// - an opening that no longer fits (too wide for its bay or wall, under a mono-pitch slope, off the wall) is never
//   shrunk: it is placed as close as possible and reported as not fitting (`fits: false`, conflict kind 'fit');
// - the intent itself is never rewritten, so growing the hall back restores every position exactly.

import { clampOpening, isFloorStanding, legacyToOpening, MIN_OPENING_SIZE } from './openingMath';
import type {
  Opening,
  OpeningAnchor,
  OpeningIntent,
  OpeningRect,
  WallBay,
  WallId,
  WallKind,
  WallSpan,
  WallSpans,
} from './types';
import { WALL_IDS } from './types';
import { validateOpenings } from './validateOpenings';

/** An opening within this distance of its bay's centre is anchored as centred. */
export const CENTRE_TOLERANCE = 0.01;
const EPS = 1e-6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Placed rectangles are on a millimetre grid, like every other opening coordinate. */
const mm = (v: number) => Math.round(v * 1000) / 1000;
/** Anchor offsets keep sub-millimetre precision, so anchor -> rect -> anchor is lossless on the mm grid. */
const micro = (v: number) => Math.round(v * 1e6) / 1e6;

export function wallKindOf(wallId: WallId): WallKind {
  return wallId === 'PereteSTG' || wallId === 'PereteDR' ? 'side' : 'end';
}

/** The anchor kinds a wall accepts: bays on side walls, the centre line on end walls, free placement on both. */
export function anchorFitsWall(anchor: OpeningAnchor, wallId: WallId): boolean {
  if (anchor.kind === 'wallStart') return true;
  return anchor.kind === (wallKindOf(wallId) === 'side' ? 'bay' : 'axis');
}

/** Bays of a side wall, front to back. Without frames the whole wall is one bay. */
export function baysOf(span: WallSpan): WallBay[] {
  if (span.bays && span.bays.length > 0) return [...span.bays];
  const axes = [...(span.supports ?? [])].sort((a, b) => a - b);
  if (axes.length < 2) return [{ h0: 0, h1: span.length }];
  return axes.slice(1).map((h1, i) => ({ h0: axes[i], h1 }));
}

/** Clear width of a bay: between the column flanges. */
const clearWidth = (bay: WallBay, span: WallSpan) => bay.h1 - bay.h0 - 2 * (span.supportHalfWidth ?? 0);

/** Index of the bay holding `h` (the first bay before the first frame, the last one after the last frame). */
export function bayIndexAt(h: number, bays: readonly WallBay[]): number {
  for (let i = 0; i < bays.length; i++) if (h < bays[i].h1) return i;
  return bays.length - 1;
}

/**
 * The stretch [lo, hi] of the wall along which the face is at least `top` high. Empty (lo > hi) when the face is
 * lower everywhere. The face rises linearly from `height` at the ends to `apex` at `apexAt`.
 */
export function faceStretch(span: WallSpan, top: number): { lo: number; hi: number } {
  const eave = span.height;
  const apex = Math.max(eave, span.apex ?? eave);
  if (top <= eave + EPS) return { lo: 0, hi: span.length };
  if (top > apex + EPS) return { lo: 1, hi: 0 };
  const apexAt = clamp(span.apexAt ?? span.length / 2, 0, span.length);
  const above = apex > eave ? (top - eave) / (apex - eave) : 1;
  return { lo: apexAt * above, hi: apexAt + (span.length - apexAt) * (1 - above) };
}

/** Sill and size of an intent as they are placed: a resize of the hall never changes them. */
function intentSize(intent: Pick<OpeningIntent, 'type' | 'sill' | 'width' | 'height'>) {
  return {
    sill: isFloorStanding(intent.type) ? 0 : Math.max(0, intent.sill),
    width: Math.max(MIN_OPENING_SIZE, intent.width),
    height: Math.max(MIN_OPENING_SIZE, intent.height),
  };
}

/** Where the anchor wants the opening's left edge, with the bay it refers to (side walls only). */
function targetOf(
  anchor: OpeningAnchor,
  width: number,
  span: WallSpan,
): { left: number; bay?: WallBay; bayMissing: boolean } {
  switch (anchor.kind) {
    case 'wallStart':
      return { left: anchor.offsetX, bayMissing: false };
    case 'axis':
      return { left: span.length / 2 + anchor.fromCentre - width / 2, bayMissing: false };
    case 'bay': {
      const bays = baysOf(span);
      const index = Math.min(Math.max(0, Math.floor(anchor.bay)), bays.length - 1);
      const bay = bays[index];
      const left = anchor.offset === 'centre' ? (bay.h0 + bay.h1) / 2 - width / 2 : bay.h0 + anchor.offset;
      return { left, bay, bayMissing: anchor.bay >= bays.length };
    }
  }
}

export interface Placement {
  rect: OpeningRect;
  /** The opening sits exactly where its anchor says and fits there (its bay, the wall face). */
  fits: boolean;
}

/**
 * The rectangle an intent occupies on the current wall. Size and sill are kept; only the position is derived. When
 * the anchor's spot does not fit, the opening is placed as close to it as the wall allows and `fits` is false.
 */
export function placeOpening(
  intent: Pick<OpeningIntent, 'type' | 'anchor' | 'sill' | 'width' | 'height'>,
  span: WallSpan,
): Placement {
  const { sill, width, height } = intentSize(intent);
  const target = targetOf(intent.anchor, width, span);
  const { lo, hi } = faceStretch(span, sill + height);
  const roomy = hi - lo >= width - EPS;
  // Not enough room anywhere: keep it on the wall, as near to its spot as possible.
  const range = roomy ? { lo, hi: hi - width } : { lo: 0, hi: Math.max(0, span.length - width) };
  const left = mm(clamp(target.left, range.lo, Math.max(range.lo, range.hi)));
  const tooWideForBay = target.bay !== undefined && width > clearWidth(target.bay, span) + EPS;
  const fits = roomy && !target.bayMissing && !tooWideForBay && Math.abs(left - mm(target.left)) < EPS;
  return { rect: { offsetX: left, sill, width, height }, fits };
}

/**
 * The anchor of a rectangle placed (or dragged) on a wall. Side walls: the bay holding the opening's centre, centred
 * when within `CENTRE_TOLERANCE` of the bay centre. End walls: the distance from the centre line. `free` gives a
 * wall-start anchor (snapping off).
 */
export function anchorFromRect(
  rect: OpeningRect,
  span: WallSpan,
  wallKind: WallKind,
  opts: { free?: boolean } = {},
): OpeningAnchor {
  if (opts.free) return { kind: 'wallStart', offsetX: micro(rect.offsetX) };
  const centre = rect.offsetX + rect.width / 2;
  if (wallKind === 'end') return { kind: 'axis', fromCentre: micro(centre - span.length / 2) };
  const bays = baysOf(span);
  const bay = bayIndexAt(centre, bays);
  const { h0, h1 } = bays[bay];
  if (Math.abs(centre - (h0 + h1) / 2) <= CENTRE_TOLERANCE) return { kind: 'bay', bay, offset: 'centre' };
  return { kind: 'bay', bay, offset: micro(rect.offsetX - h0) };
}

/** An intent made from a rectangle on its wall. */
export function intentFromRect(
  base: Pick<OpeningIntent, 'id' | 'type' | 'wallId'> & Partial<Pick<OpeningIntent, 'linkId'>>,
  rect: OpeningRect,
  span: WallSpan,
  opts: { free?: boolean } = {},
): OpeningIntent {
  const intent: OpeningIntent = {
    id: base.id,
    type: base.type,
    wallId: base.wallId,
    anchor: anchorFromRect(rect, span, wallKindOf(base.wallId), opts),
    sill: isFloorStanding(base.type) ? 0 : rect.sill,
    width: rect.width,
    height: rect.height,
  };
  if (base.linkId) intent.linkId = base.linkId;
  return intent;
}

export interface PlacementStatus {
  /** Placed exactly at its anchor (or, for a moved one, at its new bay) and inside its bay / wall. */
  fits: boolean;
  /** Its bay no longer exists: it stands in another bay of the same wall. */
  moved: boolean;
}

export interface PlacedOpenings {
  /** In the order of the intents. */
  openings: Opening[];
  status: Record<string, PlacementStatus>;
}

const overlapsRect = (a: OpeningRect, b: OpeningRect) =>
  a.offsetX < b.offsetX + b.width - EPS &&
  b.offsetX < a.offsetX + a.width - EPS &&
  a.sill < b.sill + b.height - EPS &&
  b.sill < a.sill + a.height - EPS;

const toOpening = (intent: OpeningIntent, rect: OpeningRect): Opening => {
  const o: Opening = { id: intent.id, type: intent.type, wallId: intent.wallId, ...rect, anchor: intent.anchor };
  if (intent.linkId) o.linkId = intent.linkId;
  return o;
};

/**
 * Places every intent on the current walls. Openings whose bay still exists are placed first; those whose bay is gone
 * then take the nearest free bay of their wall (nearest to the lost bay, free = no overlap and it fits there). With no
 * free bay, they stay in the last bay and do not fit.
 */
export function placeAll(intents: readonly OpeningIntent[], spans: WallSpans): PlacedOpenings {
  const rects = new Map<string, OpeningRect>();
  const status: Record<string, PlacementStatus> = {};
  const homeless: OpeningIntent[] = [];

  for (const intent of intents) {
    const span = spans[intent.wallId];
    const p = placeOpening(intent, span);
    if (intent.anchor.kind === 'bay' && intent.anchor.bay >= baysOf(span).length) {
      homeless.push(intent);
      rects.set(intent.id, p.rect);
      continue;
    }
    rects.set(intent.id, p.rect);
    status[intent.id] = { fits: p.fits, moved: false };
  }

  homeless.sort((a, b) => (a.anchor as { bay: number }).bay - (b.anchor as { bay: number }).bay);
  for (const intent of homeless) {
    const span = spans[intent.wallId];
    const anchor = intent.anchor as Extract<OpeningAnchor, { kind: 'bay' }>;
    const count = baysOf(span).length;
    const neighbours = intents.filter(
      (o) => o.id !== intent.id && o.wallId === intent.wallId && status[o.id] !== undefined,
    );
    let placed: Placement | null = null;
    // Nearest to the lost bay first: the last bay, then towards the front.
    for (let bay = count - 1; bay >= 0 && !placed; bay--) {
      const p = placeOpening({ ...intent, anchor: { ...anchor, bay } }, span);
      if (p.fits && neighbours.every((o) => !overlapsRect(p.rect, rects.get(o.id)!))) placed = p;
    }
    if (placed) {
      rects.set(intent.id, placed.rect);
      status[intent.id] = { fits: true, moved: true };
    } else {
      status[intent.id] = { fits: false, moved: false };
    }
  }

  return { openings: intents.map((i) => toOpening(i, rects.get(i.id)!)), status };
}

/** A candidate spot for `intent` is valid when it fits and clashes with nothing (others, columns, downpipes). */
function validSpot(candidate: OpeningIntent, others: readonly Opening[], spans: WallSpans): boolean {
  const p = placeOpening(candidate, spans[candidate.wallId]);
  if (!p.fits) return false;
  const me = toOpening(candidate, p.rect);
  return !validateOpenings([...others, me], spans).some((c) => c.openingId === candidate.id);
}

const SEARCH_STEP = 0.05;

/** Valid spots on one wall for an opening of the given size, nearest to `aroundLeft` first. */
function searchWall(
  intent: OpeningIntent,
  wallId: WallId,
  size: { width: number; height: number; sill: number },
  aroundLeft: number,
  others: readonly Opening[],
  spans: WallSpans,
): OpeningIntent | null {
  const span = spans[wallId];
  const base = { ...intent, wallId, ...size, sill: isFloorStanding(intent.type) ? 0 : size.sill };
  const fromRect = (left: number) =>
    intentFromRect(base, { offsetX: mm(left), sill: base.sill, width: size.width, height: size.height }, span);

  // Side walls: bay centres first, nearest bay first.
  if (wallKindOf(wallId) === 'side') {
    const bays = baysOf(span)
      .map((b, i) => ({ i, c: (b.h0 + b.h1) / 2 }))
      .sort((a, b) => Math.abs(a.c - (aroundLeft + size.width / 2)) - Math.abs(b.c - (aroundLeft + size.width / 2)));
    for (const { i } of bays) {
      const candidate: OpeningIntent = { ...base, anchor: { kind: 'bay', bay: i, offset: 'centre' } };
      if (validSpot(candidate, others, spans)) return candidate;
    }
  }
  const maxLeft = span.length - size.width;
  if (maxLeft < 0) return null;
  const start = clamp(aroundLeft, 0, maxLeft);
  const steps = Math.ceil(span.length / SEARCH_STEP);
  for (let k = 0; k <= steps; k++) {
    for (const left of k === 0 ? [start] : [start - k * SEARCH_STEP, start + k * SEARCH_STEP]) {
      if (left < -EPS || left > maxLeft + EPS) continue;
      const candidate = fromRect(clamp(left, 0, maxLeft));
      if (validSpot(candidate, others, spans)) return candidate;
    }
  }
  return null;
}

/**
 * "Reașază automat": the nearest valid placement for an opening that does not fit (or clashes). Tries, in order:
 * its own wall at its size, the other walls at its size, then its own wall smaller (the only case that shrinks it,
 * and only because the user asked). Returns the new intent, or null when nothing works.
 */
export function autoPlace(
  intent: OpeningIntent,
  intents: readonly OpeningIntent[],
  spans: WallSpans,
): OpeningIntent | null {
  const others = placeAll(
    intents.filter((o) => o.id !== intent.id),
    spans,
  ).openings;
  const size = intentSize(intent);
  const current = placeOpening(intent, spans[intent.wallId]).rect.offsetX;

  const own = searchWall(intent, intent.wallId, size, current, others, spans);
  if (own) return own;

  for (const wallId of WALL_IDS) {
    if (wallId === intent.wallId) continue;
    const span = spans[wallId];
    const found = searchWall(intent, wallId, size, span.length / 2 - size.width / 2, others, spans);
    if (found) return found;
  }

  for (let scale = 0.95; scale > 0; scale -= 0.05) {
    const smaller = {
      sill: size.sill,
      width: Math.max(MIN_OPENING_SIZE, mm(size.width * scale)),
      height: Math.max(MIN_OPENING_SIZE, mm(size.height * scale)),
    };
    const found = searchWall(intent, intent.wallId, smaller, current, others, spans);
    if (found) return found;
    if (smaller.width === MIN_OPENING_SIZE && smaller.height === MIN_OPENING_SIZE) break;
  }
  return null;
}

// ─── Untrusted input ──────────────────────────────────────────────────────────

const OPENING_TYPES: readonly string[] = ['window', 'door', 'garageDoor'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Anchor coordinates are bounded by the longest wall (102 m) with plenty of margin. */
const MAX_ANCHOR_M = 200;
const MAX_BAY_INDEX = 1000;
const MAX_ID_LENGTH = 64;

/** A well-formed anchor from untrusted data, or null. Unknown keys are dropped. */
export function parseAnchor(raw: unknown): OpeningAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const inRange = (v: unknown, lo: number, hi: number): v is number => isNum(v) && v >= lo && v <= hi;
  switch (a.kind) {
    case 'bay': {
      if (!Number.isInteger(a.bay) || !inRange(a.bay, 0, MAX_BAY_INDEX)) return null;
      if (a.offset === 'centre') return { kind: 'bay', bay: a.bay, offset: 'centre' };
      if (!inRange(a.offset, -MAX_ANCHOR_M, MAX_ANCHOR_M)) return null;
      return { kind: 'bay', bay: a.bay, offset: a.offset };
    }
    case 'axis':
      return inRange(a.fromCentre, -MAX_ANCHOR_M, MAX_ANCHOR_M) ? { kind: 'axis', fromCentre: a.fromCentre } : null;
    case 'wallStart':
      return inRange(a.offsetX, 0, MAX_ANCHOR_M) ? { kind: 'wallStart', offsetX: a.offsetX } : null;
    default:
      return null;
  }
}

const shortString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH ? v : undefined;

/**
 * Validate and normalise openings from untrusted input (localStorage, shared links, saved models) into intents.
 * Accepts v2 (an `anchor`, with or without the placed metric fields), v1 (metres: `offsetX`/`sill`) and v0
 * (normalised `posX`/`posY`). v0/v1 are clamped to `spans` and turned into anchors on those walls. Malformed entries
 * are dropped; missing or duplicate ids are replaced with `makeId()`.
 */
export function normalizeIntents(raw: unknown, spans: WallSpans, makeId: () => string): OpeningIntent[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: OpeningIntent[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const type = o.type as OpeningIntent['type'];
    const wallId = o.wallId as WallId;
    if (!OPENING_TYPES.includes(type) || !WALL_IDS.includes(wallId)) continue;
    if (!isNum(o.width) || !isNum(o.height)) continue;

    const anchor = parseAnchor(o.anchor);
    const usableAnchor = anchor && anchorFitsWall(anchor, wallId) ? anchor : null;
    const hasMetric = isNum(o.offsetX) && isNum(o.sill);
    const hasLegacy = isNum(o.posX) && isNum(o.posY);
    if (!usableAnchor && !hasMetric && !hasLegacy) continue;

    let id = shortString(o.id) ?? '';
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);

    const wall = spans[wallId];
    const base = { id, type, wallId, width: o.width, height: o.height };
    let intent: OpeningIntent;
    if (usableAnchor) {
      // Only the wall-independent rules: the hall may still change, and a resize never shrinks an intent.
      const r = clampOpening({ ...base, offsetX: 0, sill: isNum(o.sill) ? o.sill : 0 });
      intent = { id, type, wallId, anchor: usableAnchor, sill: r.sill, width: r.width, height: r.height };
    } else {
      const r = hasMetric
        ? clampOpening({ ...base, offsetX: o.offsetX as number, sill: o.sill as number }, wall)
        : legacyToOpening({ ...base, posX: o.posX as number, posY: o.posY as number }, wall);
      intent = intentFromRect(base, r, wall);
    }
    const linkId = shortString(o.linkId);
    if (linkId) intent.linkId = linkId;
    out.push(intent);
  }
  return out;
}
