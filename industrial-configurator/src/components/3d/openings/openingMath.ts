// Pure opening geometry: clamping, anchored resizing and legacy-data migration.
// No React / three / zustand imports, so it is unit-testable in node.

import type {
  LegacyOpening,
  Opening,
  OpeningType,
  ResizeHandle,
  WallId,
  WallSpan,
  WallSpans,
} from './types';
import { WALL_IDS } from './types';

/** Smallest allowed opening edge, in metres. */
export const MIN_OPENING_SIZE = 0.3;

export const DEFAULT_DIMENSIONS: Record<OpeningType, { width: number; height: number }> = {
  window: { width: 1, height: 1 },
  door: { width: 1, height: 2.1 },
  garageDoor: { width: 3, height: 3 },
};

const OPENING_TYPES: readonly OpeningType[] = ['window', 'door', 'garageDoor'];

/** Doors (personnel and industrial) always stand on the floor. */
export function isFloorStanding(type: OpeningType): boolean {
  return type === 'door' || type === 'garageDoor';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Round to the millimetre so repeated drags don't accumulate float noise. */
const mm = (v: number) => Math.round(v * 1000) / 1000;
const finiteOr = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Single source of truth for opening bounds. Used by add, update, drag, resize and migration.
 * - width/height >= MIN_OPENING_SIZE and <= the wall's length/height
 * - the opening stays fully inside the wall rectangle
 * - doors: sill = 0
 * Without a `wall`, only the wall-independent rules apply (min size, non-negative position, doors on floor).
 */
export function clampOpening(opening: Opening, wall?: WallSpan | null): Opening {
  const dims = DEFAULT_DIMENSIONS[opening.type];
  let width = Math.max(MIN_OPENING_SIZE, mm(finiteOr(opening.width, dims.width)));
  let height = Math.max(MIN_OPENING_SIZE, mm(finiteOr(opening.height, dims.height)));
  let offsetX = Math.max(0, mm(finiteOr(opening.offsetX, 0)));
  let sill = isFloorStanding(opening.type) ? 0 : Math.max(0, mm(finiteOr(opening.sill, 0)));

  if (wall) {
    width = Math.min(width, wall.length);
    height = Math.min(height, wall.height);
    offsetX = clamp(offsetX, 0, Math.max(0, wall.length - width));
    if (!isFloorStanding(opening.type)) sill = clamp(sill, 0, Math.max(0, wall.height - height));
  }

  return { ...opening, width, height, offsetX, sill };
}

/**
 * Resize from a corner handle, anchored to the opposite edges: dragging the right edge never moves
 * the left edge, and vice versa. `dH`/`dV` are pointer deltas in metres along the wall axis / up,
 * measured from `start` (the opening as it was at pointer-down). Doors keep their bottom on the floor,
 * so bottom handles only change their width.
 */
export function resizeOpening(
  start: Opening,
  handle: ResizeHandle,
  dH: number,
  dV: number,
  wall?: WallSpan | null,
): Opening {
  const maxRight = wall ? wall.length : Infinity;
  const maxTop = wall ? wall.height : Infinity;
  const right = start.offsetX + start.width;
  const top = start.sill + start.height;
  let { offsetX, sill, width, height } = start;

  if (handle.includes('r')) {
    width = clamp(start.width + dH, MIN_OPENING_SIZE, Math.max(MIN_OPENING_SIZE, maxRight - start.offsetX));
  } else {
    width = clamp(start.width - dH, MIN_OPENING_SIZE, Math.max(MIN_OPENING_SIZE, right));
    offsetX = right - width;
  }

  if (handle.includes('t')) {
    height = clamp(start.height + dV, MIN_OPENING_SIZE, Math.max(MIN_OPENING_SIZE, maxTop - start.sill));
  } else if (!isFloorStanding(start.type)) {
    height = clamp(start.height - dV, MIN_OPENING_SIZE, Math.max(MIN_OPENING_SIZE, top));
    sill = top - height;
  }

  return clampOpening({ ...start, offsetX, sill, width, height }, wall);
}

/** Convert a pre-v1 opening (normalised centre) to metres on the given wall. */
export function legacyToOpening(legacy: LegacyOpening, wall: WallSpan): Opening {
  const { posX, posY, ...rest } = legacy;
  return clampOpening(
    {
      ...rest,
      offsetX: posX * wall.length - legacy.width / 2,
      sill: posY * wall.height - legacy.height / 2,
    },
    wall,
  );
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate and normalise openings from untrusted input (localStorage, shared links).
 * Accepts both the current metric shape and the legacy normalised shape, drops malformed entries,
 * clamps everything to `spans`, and replaces missing or duplicate ids with `makeId()`.
 */
export function normalizeOpenings(raw: unknown, spans: WallSpans, makeId: () => string): Opening[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Opening[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const type = o.type as OpeningType;
    const wallId = o.wallId as WallId;
    if (!OPENING_TYPES.includes(type) || !WALL_IDS.includes(wallId)) continue;
    if (!isNum(o.width) || !isNum(o.height)) continue;

    let id = typeof o.id === 'string' && o.id.length > 0 ? o.id : '';
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);

    const wall = spans[wallId];
    const base = { id, type, wallId, width: o.width, height: o.height };
    if (isNum(o.offsetX) && isNum(o.sill)) {
      out.push(clampOpening({ ...base, offsetX: o.offsetX, sill: o.sill }, wall));
    } else if (isNum(o.posX) && isNum(o.posY)) {
      out.push(legacyToOpening({ ...base, posX: o.posX, posY: o.posY }, wall));
    }
  }
  return out;
}

/** Centre of an opening in wall-local metres (x along the wall, y up). */
export function openingCentre(o: Opening): { x: number; y: number } {
  return { x: o.offsetX + o.width / 2, y: o.sill + o.height / 2 };
}
