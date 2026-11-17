// Shared opening types. Re-exported by `@/stores/useOpeningsStore`.

export type OpeningType = 'window' | 'door' | 'garageDoor';
export type WallId = 'PereteSTG' | 'PereteDR' | 'PereteFata' | 'PereteSpate';

export const WALL_IDS: readonly WallId[] = ['PereteFata', 'PereteSpate', 'PereteSTG', 'PereteDR'];

/**
 * An opening on a wall, in metres, in the wall's own 2D frame:
 * x runs along the wall from its start (see `WallDescriptor.origin`/`axisH`), y is up from the floor.
 */
export interface Opening {
  id: string;
  type: OpeningType;
  wallId: WallId;
  /** Distance in metres from the wall start to the opening's left edge. */
  offsetX: number;
  /** Height in metres of the opening's bottom edge above the floor. Always 0 for doors. */
  sill: number;
  /** Width in metres. */
  width: number;
  /** Height in metres. */
  height: number;
}

/** Pre-v1 persisted shape: centre position normalised (0–1) to the wall span. */
export interface LegacyOpening {
  id: string;
  type: OpeningType;
  wallId: WallId;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

/** A rectangle on a wall face, in the wall's (h, v) metres. */
export interface WallRect {
  h0: number;
  h1: number;
  v0: number;
  v1: number;
}

/** The usable area of one wall, in metres. */
export interface WallSpan {
  /** Horizontal length of the wall face. */
  length: number;
  /** Height of the rectangular part (up to the eave). */
  height: number;
  /** End walls only: height of the highest point above the floor. The face rises from `height` at both ends to `apex` at `apexAt`. */
  apex?: number;
  /** Where along the wall the face is highest: the middle of a gable (default), one end of a mono-pitch end wall. */
  apexAt?: number;
  /** `h` of every column axis behind the wall (openings must not cross them). */
  supports?: readonly number[];
  /** Half the width each support occupies along `h`. */
  supportHalfWidth?: number;
  /** Other no-go rectangles, e.g. downpipes. */
  blockers?: readonly WallRect[];
}

export type WallSpans = Record<WallId, WallSpan>;

/** Resize handle ids: t/b = top/bottom, l/r = left/right. */
export type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br';
