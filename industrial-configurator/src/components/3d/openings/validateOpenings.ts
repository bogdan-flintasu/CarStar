// Opening conflicts (E7) and wall spans from a hall layout (E6). Pure: no React, three or zustand.

import type { HallLayout } from '@/lib/hall';
import type { Opening, WallId, WallRect, WallSpan, WallSpans } from './types';

export type ConflictKind = 'overlap' | 'support' | 'blocker';

export interface OpeningConflict {
  kind: ConflictKind;
  /** The opening that has the problem. For `overlap` it is reported once per opening involved. */
  openingId: string;
  /** For `overlap`: the other opening. */
  otherId?: string;
}

/** Downpipe half-width plus clearance, along the wall. */
export const DOWNPIPE_HALF_WIDTH = 0.1;
const EPS = 1e-6;

/** Rectangles of a side wall that must stay free: its downpipes. */
export function blockersForWall(layout: HallLayout, wallId: WallId): WallRect[] {
  const wall = Object.values(layout.walls).find((w) => w.id === wallId);
  if (!wall || (wall.key !== 'left' && wall.key !== 'right')) return [];
  return layout.downpipes
    .filter((d) => d.side === wall.key)
    .map((d) => {
      const h = (d.x - wall.origin[0]) * wall.axisH[0] + (d.z - wall.origin[2]) * wall.axisH[2];
      return { h0: h - DOWNPIPE_HALF_WIDTH, h1: h + DOWNPIPE_HALF_WIDTH, v0: d.bottomY, v1: d.topY };
    });
}

/** Wall spans (with gable apex, supports and blockers) for every wall of a layout. */
export function wallSpansFromLayout(layout: HallLayout): WallSpans {
  const spans = {} as WallSpans;
  for (const wall of Object.values(layout.walls)) {
    spans[wall.id] = {
      length: wall.spanH,
      height: wall.spanV,
      apex: wall.apexV > wall.spanV ? wall.apexV : undefined,
      supports: wall.supports,
      supportHalfWidth: wall.supportHalfWidth,
      blockers: blockersForWall(layout, wall.id),
    };
  }
  return spans;
}

function validateWall(openings: readonly Opening[], span: WallSpan | undefined, out: OpeningConflict[]) {
  for (let i = 0; i < openings.length; i++) {
    const a = openings[i];
    const a1 = a.offsetX + a.width;
    const aTop = a.sill + a.height;

    for (let j = i + 1; j < openings.length; j++) {
      const b = openings[j];
      const overlap =
        a.offsetX < b.offsetX + b.width - EPS &&
        b.offsetX < a1 - EPS &&
        a.sill < b.sill + b.height - EPS &&
        b.sill < aTop - EPS;
      if (overlap) {
        out.push({ kind: 'overlap', openingId: a.id, otherId: b.id });
        out.push({ kind: 'overlap', openingId: b.id, otherId: a.id });
      }
    }

    if (!span) continue;
    const half = span.supportHalfWidth ?? 0;
    // A column behind the wall: the opening must not cover any part of its width.
    if (span.supports?.some((h) => a.offsetX < h + half - EPS && h - half < a1 - EPS)) {
      out.push({ kind: 'support', openingId: a.id });
    }
    if (span.blockers?.some((r) => a.offsetX < r.h1 && r.h0 < a1 && a.sill < r.v1 && r.v0 < aTop)) {
      out.push({ kind: 'blocker', openingId: a.id });
    }
  }
}

/**
 * All conflicts between openings, columns/frames and downpipes. Empty = the configuration may continue.
 * Out-of-bounds cannot happen: every mutation goes through `clampOpening`.
 */
export function validateOpenings(openings: readonly Opening[], spans: WallSpans | null): OpeningConflict[] {
  const out: OpeningConflict[] = [];
  const byWall = new Map<WallId, Opening[]>();
  for (const o of openings) byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o]);
  for (const [wallId, list] of byWall) validateWall(list, spans?.[wallId], out);
  return out;
}

export const conflictingIds = (conflicts: readonly OpeningConflict[]): Set<string> =>
  new Set(conflicts.map((c) => c.openingId));
