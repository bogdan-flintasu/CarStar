// Symmetry (T1e): mirror twins of openings. Pure: no React, three or zustand.
//
// - "Stânga↔Dreapta" (leftRight): left <-> right long wall. Both side walls count `h` from the front, so the twin
//   keeps the anchor as is (same bay index from the front, same offset in the bay).
// - "Față↔Spate" (frontBack): front <-> back gable. Each gable's `h` runs left to right as seen from outside, so a
//   mirror image (same world x) has `fromCentre` -> `-fromCentre` (a wall-start anchor: from the other end).
// - "Pe axa peretelui" (wallAxis): on a gable, an item left of the axis gets a twin right of it (`fromCentre` ->
//   `-fromCentre`). An item on the axis has no twin; a garage door snaps to the axis.
// The pair a twin belongs to follows from the two walls (`pairMode`), so twins stay linked whatever mode is on now.

import { CENTRE_TOLERANCE, wallKindOf } from './anchors';
import type { OpeningAnchor, OpeningIntent, OpeningType, WallId, WallSpan } from './types';

export type SymmetryMode = 'none' | 'leftRight' | 'frontBack' | 'wallAxis';

export const SYMMETRY_MODES: readonly SymmetryMode[] = ['none', 'leftRight', 'frontBack', 'wallAxis'];

export const SYMMETRY_LABEL: Record<SymmetryMode, string> = {
  none: 'Niciuna',
  leftRight: 'Stânga↔Dreapta',
  frontBack: 'Față↔Spate',
  wallAxis: 'Pe axa peretelui',
};

const OPPOSITE: Partial<Record<SymmetryMode, Partial<Record<WallId, WallId>>>> = {
  leftRight: { PereteSTG: 'PereteDR', PereteDR: 'PereteSTG' },
  frontBack: { PereteFata: 'PereteSpate', PereteSpate: 'PereteFata' },
};

const mm = (v: number) => Math.round(v * 1000) / 1000;

/** The wall a twin of an item on `wallId` goes to under `mode`, or null when the mode gives that wall no twin. */
export function mirrorWall(wallId: WallId, mode: SymmetryMode): WallId | null {
  if (mode === 'wallAxis') return wallKindOf(wallId) === 'end' ? wallId : null;
  return OPPOSITE[mode]?.[wallId] ?? null;
}

/** The mode that links an item on `a` with a twin on `b`, or null when those walls cannot be twins. */
export function pairMode(a: WallId, b: WallId): Exclude<SymmetryMode, 'none'> | null {
  if (a === b) return wallKindOf(a) === 'end' ? 'wallAxis' : null;
  if (OPPOSITE.leftRight?.[a] === b) return 'leftRight';
  if (OPPOSITE.frontBack?.[a] === b) return 'frontBack';
  return null;
}

/** An anchor mirrored about the wall's centre line (`width`: the item's; `length`: the wall's). */
export function mirrorAnchorAcrossCentre(anchor: OpeningAnchor, width: number, length: number): OpeningAnchor {
  switch (anchor.kind) {
    case 'axis':
      return { kind: 'axis', fromCentre: anchor.fromCentre === 0 ? 0 : -anchor.fromCentre };
    case 'wallStart':
      return { kind: 'wallStart', offsetX: mm(length - anchor.offsetX - width) };
    default:
      return anchor;
  }
}

/** Whether an item on an end wall sits on the wall's axis (its centre within `CENTRE_TOLERANCE` of the middle). */
export function isOnAxis(anchor: OpeningAnchor, width: number, length: number): boolean {
  if (anchor.kind === 'axis') return Math.abs(anchor.fromCentre) <= CENTRE_TOLERANCE;
  if (anchor.kind === 'wallStart') return Math.abs(anchor.offsetX + width / 2 - length / 2) <= CENTRE_TOLERANCE;
  return false;
}

type Mirrorable = Pick<OpeningIntent, 'type' | 'wallId' | 'anchor' | 'sill' | 'width' | 'height'>;

/**
 * The twin of `item` on `target` (the wall `mirrorWall`/`pairMode` gave): same type, size and sill, mirrored anchor.
 * Null when the walls are not a pair, or (on the same gable) when the item sits on the axis. Never resized: a twin
 * that does not fit there is kept and shown as not fitting.
 */
export function mirrorTo<T extends Mirrorable>(item: T, target: WallId, span: WallSpan): Omit<T, 'wallId' | 'anchor'> & Mirrorable | null {
  const mode = pairMode(item.wallId, target);
  if (!mode) return null;
  if (mode === 'wallAxis' && isOnAxis(item.anchor, item.width, span.length)) return null;
  const anchor = mode === 'leftRight' ? item.anchor : mirrorAnchorAcrossCentre(item.anchor, item.width, span.length);
  return { ...item, wallId: target, anchor };
}

/** The twin a new placement gets under `mode` (no id, no link), or null when it gets none. */
export function twinFor<T extends Mirrorable>(item: T, mode: SymmetryMode, spans: Record<WallId, WallSpan>) {
  const target = mirrorWall(item.wallId, mode);
  return target ? mirrorTo(item, target, spans[target]) : null;
}

/** "Pe axa peretelui": a garage door placed on a gable snaps to the axis. */
export function snapsToAxis(type: OpeningType, wallId: WallId, mode: SymmetryMode): boolean {
  return mode === 'wallAxis' && type === 'garageDoor' && wallKindOf(wallId) === 'end';
}

/** The other member of `id`'s pair in `intents`, if any. */
export function twinOf<T extends { id: string; linkId?: string }>(intents: readonly T[], id: string): T | undefined {
  const me = intents.find((o) => o.id === id);
  if (!me?.linkId) return undefined;
  return intents.find((o) => o.id !== id && o.linkId === me.linkId);
}

/**
 * After `id` changed (moved, resized, centred), its twin follows (mirrored). When the item went to a wall that no
 * longer pairs with its twin's, both lose the link. Returns the new list (the same one when nothing is linked).
 */
export function syncTwin(intents: OpeningIntent[], id: string, spans: Record<WallId, WallSpan>): OpeningIntent[] {
  const me = intents.find((o) => o.id === id);
  const twin = twinOf(intents, id);
  if (!me || !twin) return intents;
  const mirrored = mirrorTo(me, twin.wallId, spans[twin.wallId]);
  if (!mirrored) {
    return intents.map((o) => (o.id === me.id || o.id === twin.id ? { ...o, linkId: undefined } : o));
  }
  const next: OpeningIntent = { ...mirrored, id: twin.id, linkId: twin.linkId };
  return intents.map((o) => (o.id === twin.id ? next : o));
}
