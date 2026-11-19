/**
 * Hall-based level of detail: what the hall costs to draw, and which small pieces are worth drawing from where.
 * Pure (three.js maths only, no scene, no React): unit-tested.
 *
 * Design
 * - Cost: instances per kit piece x triangles per piece (x2 for shadow casters: they are drawn again into the shadow
 *   map). Bolts dominate a long hall (~70 per frame at 56 triangles each).
 * - Bolts are static and never picked: they are split into chunks along the hall (`BOLT_CHUNK_LENGTH_M`), one instanced
 *   draw call each. Before every live render each chunk is shown only if a bolt at the chunk's nearest point would be
 *   at least `minDetailPx` CSS pixels on screen (`projectedSizePx`). At that size a bolt is a speck, so dropping it is
 *   not visible; far away (the usual whole-hall view) none are drawn. Chunks are also frustum-culled on their own.
 * - Offscreen renders (quote renders, snapshots, AO passes) always draw every chunk: their quality is fixed.
 * - Pickable pieces (columns, rafters, purlins, cleats, gutters...) are not split or reordered: one instanced mesh per
 *   piece, instance i = placements[piece][i] (see KitInstances.tsx).
 * - Far purlins: the kit's Purlin_LOD1 saves 5 of 35 triangles: not worth a second mesh (and it would split the
 *   pickable purlins), so purlins are left as they are.
 */
import type { Matrix4 } from 'three';

/** Length of hall (metres, along Z) whose bolts share one draw call. */
export const BOLT_CHUNK_LENGTH_M = 12;
/** The visible size of a bolt (its head across the corners, metres): the kit's bolt is 36 mm wide, 80 mm long. */
export const BOLT_DETAIL_SIZE_M = 0.036;
/** Smallest on-screen size (CSS px) a bolt is drawn at: normal detail, and with far detail off (governor level). */
export const MIN_DETAIL_PX = { full: 1, reduced: 3 } as const;

/** One kit piece in the cost estimate. */
export interface PieceCost {
  name: string;
  instances: number;
  trianglesEach: number;
  /** Drawn into the shadow map too. */
  castsShadow?: boolean;
}

export interface HallCost {
  /** Triangles per frame with every piece drawn (shadow pass included). */
  triangles: number;
  instances: number;
  byPiece: { name: string; instances: number; triangles: number }[];
}

export function estimateHallCost(pieces: readonly PieceCost[]): HallCost {
  const byPiece = pieces
    .filter((piece) => piece.instances > 0)
    .map((piece) => ({
      name: piece.name,
      instances: piece.instances,
      triangles: piece.instances * piece.trianglesEach * (piece.castsShadow ? 2 : 1),
    }))
    .sort((a, b) => b.triangles - a.triangles);
  return {
    triangles: byPiece.reduce((sum, piece) => sum + piece.triangles, 0),
    instances: byPiece.reduce((sum, piece) => sum + piece.instances, 0),
    byPiece,
  };
}

/**
 * Splits instance transforms into chunks along the hall's length by their translation Z: chunk k holds the
 * instances with floor(z / length) = k. Chunks come front to back; inside a chunk the input order is kept.
 */
export function chunkAlongZ(matrices: readonly Matrix4[], length = BOLT_CHUNK_LENGTH_M): Matrix4[][] {
  const chunks = new Map<number, Matrix4[]>();
  for (const matrix of matrices) {
    const key = Math.floor(matrix.elements[14] / length);
    const chunk = chunks.get(key);
    if (chunk) chunk.push(matrix);
    else chunks.set(key, [matrix]);
  }
  return [...chunks.entries()].sort(([a], [b]) => b - a).map(([, chunk]) => chunk);
}

/** The camera, reduced to what the projected size needs. */
export type DetailView =
  | { kind: 'perspective'; fovDeg: number; zoom: number; viewportHeightPx: number }
  | { kind: 'orthographic'; frustumHeight: number; zoom: number; viewportHeightPx: number };

/** On-screen size (CSS px) of something `sizeM` across, `distanceM` from the camera (ignored in orthographic). */
export function projectedSizePx(sizeM: number, distanceM: number, view: DetailView): number {
  if (view.kind === 'orthographic') return (sizeM * view.viewportHeightPx * view.zoom) / view.frustumHeight;
  const halfHeight = Math.tan(((view.fovDeg * Math.PI) / 180) / 2) / view.zoom;
  return (sizeM * view.viewportHeightPx) / (2 * halfHeight * Math.max(distanceM, 1e-3));
}

/** Whether a chunk of small pieces (`sizeM` each), whose nearest point is `distanceM` away, is worth drawing. */
export function detailVisible(sizeM: number, distanceM: number, view: DetailView, minPx: number): boolean {
  return projectedSizePx(sizeM, distanceM, view) >= minPx;
}
