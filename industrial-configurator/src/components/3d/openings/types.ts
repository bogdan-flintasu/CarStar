// Shared opening types. Re-exported by `@/stores/useOpeningsStore`.

export type OpeningType = 'window' | 'door' | 'garageDoor';
export type WallId = 'PereteSTG' | 'PereteDR' | 'PereteFata' | 'PereteSpate';

export const WALL_IDS: readonly WallId[] = ['PereteFata', 'PereteSpate', 'PereteSTG', 'PereteDR'];

/** Side (long) walls carry bays between frames; end (gable) walls are placed from their centre line. */
export type WallKind = 'side' | 'end';

/**
 * Where the user put an opening, independent of the hall's size (T1a). A resize of the hall never rewrites it; the
 * placed rectangle (`Opening.offsetX`) is derived from it and the current layout every time (`placeOpening`).
 */
export type OpeningAnchor =
  /**
   * Side walls. `bay` 0 is the front bay (between the first two frames), counting towards the back on both side
   * walls. `offset` is the distance from the bay's lower-`h` column axis (the front one) to the opening's left
   * (lower-`h`) edge, or `'centre'` for an opening centred in the bay.
   */
  | { kind: 'bay'; bay: number; offset: 'centre' | number }
  /** End walls: metres from the wall's centre to the opening's centre, along `h`; 0 = centred. */
  | { kind: 'axis'; fromCentre: number }
  /** Free placement (snapping off): metres from the wall start to the left edge, like `offsetX`. */
  | { kind: 'wallStart'; offsetX: number };

export type OpeningAnchorKind = OpeningAnchor['kind'];

/** What the store persists for each opening: the user's intent. Width, height and sill are intent too. */
export interface OpeningIntent {
  id: string;
  type: OpeningType;
  wallId: WallId;
  anchor: OpeningAnchor;
  /** Height in metres of the bottom edge above the floor. Always 0 for doors. */
  sill: number;
  width: number;
  height: number;
  /** Reserved for T1e (symmetric twins share it). Kept as is by every action. */
  linkId?: string;
}

/**
 * An opening on a wall, in metres, in the wall's own 2D frame:
 * x runs along the wall from its start (see `WallDescriptor.origin`/`axisH`), y is up from the floor.
 * The store exposes these as placed rectangles (derived from `anchor`); `anchor` is optional only so that plain
 * rectangles (landing page, tests) are still `Opening`s.
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
  /** The intent this rectangle was placed from. Always set on the openings the store exposes. */
  anchor?: OpeningAnchor;
  /** Reserved for T1e. */
  linkId?: string;
}

/** The metric part of an opening: a rectangle on its wall. */
export type OpeningRect = Pick<Opening, 'offsetX' | 'sill' | 'width' | 'height'>;

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
  /**
   * Side walls: the bays along the wall, front to back, as the `h` of their two column axes. Without it a side wall
   * is one bay from its start to its end (or between consecutive `supports`, when given).
   */
  bays?: readonly WallBay[];
}

/** One bay of a side wall: `h` of the column axis at each end (h0 < h1). */
export interface WallBay {
  h0: number;
  h1: number;
}

export type WallSpans = Record<WallId, WallSpan>;

/** Resize handle ids: t/b = top/bottom, l/r = left/right. */
export type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br';
