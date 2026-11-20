'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import type {
  Opening,
  OpeningIntent,
  OpeningType,
  WallId,
  WallSpans,
  LegacyOpening,
} from '@/components/3d/openings/types';
import { clampOpening } from '@/components/3d/openings/openingMath';
import {
  anchorFitsWall,
  autoPlace,
  intentFromRect,
  normalizeIntents,
  placeAll,
  placeOpening,
  type PlacementStatus,
} from '@/components/3d/openings/anchors';
import { spansFromHallState, type HallState } from '@/components/3d/openings/wallSpans';
import { validateOpenings } from '@/components/3d/openings/validateOpenings';
import { centreInBayAnchor, centreOnWallAnchor, type SnapGuide } from '@/components/3d/openings/snapping';
import type { OpeningConflict } from '@/components/3d/openings/validateOpenings';
import { clipboardOf, nextFreeSpot, type NewIntent, type OpeningClipboard } from '@/components/3d/openings/copyPaste';
import { planRepeat, type RepeatPattern } from '@/components/3d/openings/repeat';
import { snapsToAxis, syncTwin, twinFor, twinOf, type SymmetryMode } from '@/components/3d/openings/symmetry';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  Opening,
  OpeningAnchor,
  OpeningIntent,
  OpeningRect,
  OpeningType,
  WallId,
  WallKind,
  WallSpan,
  WallSpans,
  LegacyOpening,
} from '@/components/3d/openings/types';
export type { OpeningConflict, ConflictKind } from '@/components/3d/openings/validateOpenings';
export type { PlacementStatus } from '@/components/3d/openings/anchors';
export type { SnapGuide } from '@/components/3d/openings/snapping';
export type { OpeningClipboard, NewIntent } from '@/components/3d/openings/copyPaste';
export type { RepeatPattern } from '@/components/3d/openings/repeat';
export type { SymmetryMode } from '@/components/3d/openings/symmetry';
export {
  clampOpening,
  resizeOpening,
  DEFAULT_DIMENSIONS,
  MIN_OPENING_SIZE,
  isFloorStanding,
} from '@/components/3d/openings/openingMath';

/**
 * Persisted schema version. v0: normalised posX/posY. v1: metres (offsetX/sill) + unique random ids.
 * v2: intents (anchor + size + sill); the placed rectangles are derived, never stored.
 */
export const OPENINGS_STORE_VERSION = 2;
export const OPENINGS_STORAGE_KEY = 'carstar-openings-storage';
const CONFIGURATOR_STORAGE_KEY = 'carstar-configurator-storage';

/** Shown after a change of the hall moved openings to another bay or left some that no longer fit. */
export interface RelayoutNotice {
  moved: number;
  unfit: number;
  /** Bumped on every new notice, so the toast restarts its timer. */
  seq: number;
}

/** A short message about the openings (e.g. "Nu mai este loc pe acest perete"); `seq` restarts its timer. */
export interface OpeningsMessage {
  text: string;
  seq: number;
}

/** What "Repetă" did: copies added and slots skipped because a copy did not fit there. */
export interface RepeatResult {
  added: number;
  skipped: number;
}

export const NO_ROOM_MESSAGE = 'Nu mai este loc pe acest perete';

/** A new opening: a rectangle (its anchor is derived on the wall), or a rectangle with an explicit anchor. */
export type NewOpening = Omit<Opening, 'id'>;
export type OpeningUpdate = Partial<Omit<Opening, 'id'>>;

interface OpeningsState {
  /** The user's intents: what is persisted, undone and shared. Never rewritten by a change of the hall. */
  intents: OpeningIntent[];
  /** Derived: every intent placed on the current walls (metric fields + `anchor`). Read this to draw/price/send. */
  openings: Opening[];
  /** Derived: per opening id, whether it fits at its anchor and whether it was moved to another bay. */
  placement: Record<string, PlacementStatus>;
  activeTool: OpeningType | null;
  selectedOpeningId: string | null;
  /** True while the user is dragging/resizing an opening — disables OrbitControls */
  isDragging: boolean;
  /** The wall currently hovered in the 3D scene */
  hoveredWallId: WallId | null;
  /** Wall rectangles of the rendered hall, pushed by the 3D layer (`WallOpenings`). Not persisted. */
  wallSpans: WallSpans | null;
  /** Overlaps, column/frame crossings, downpipe clashes (E7) and openings that do not fit ('fit'). Derived. */
  conflicts: OpeningConflict[];
  /** Set by a change of the hall that moved or unfitted openings; cleared once none are affected. */
  relayoutNotice: RelayoutNotice | null;
  /** T1c: snapping on (the phone "Aliniere" switch). Alt / ⌥ turns it off for one gesture. Not persisted. */
  snapEnabled: boolean;
  /** T1c: guides of the snaps holding during the running drag (drawn by `WallOpenings`). Not persisted. */
  snapGuides: { wallId: WallId; guides: SnapGuide[] } | null;
  /** T1d: the copied opening (Ctrl/⌘+C). Not persisted. */
  clipboard: OpeningClipboard | null;
  /** T1d: paste mode: the active tool places copies of `clipboard` (its size and sill). Ended with the tool. */
  pasting: boolean;
  /** T1d: a short message for the user (no room for a copy, …). Not persisted. */
  message: OpeningsMessage | null;
  /** T1e: new placements and copies get a mirrored twin (shared `linkId`). Per session: not persisted. */
  symmetry: SymmetryMode;

  // Actions
  /**
   * Adds an opening from a rectangle (clamped to its wall: this is a user action) and selects it; returns its id.
   * The anchor comes from the rectangle (`anchorFromRect`), or from `opening.anchor` when it suits the wall.
   * `free: true` anchors it to the wall start (snapping off).
   */
  addOpening: (opening: NewOpening, opts?: { free?: boolean }) => string;
  /** Adds an intent as is (anchor, size, sill), selects it and returns its id. */
  addIntent: (intent: Omit<OpeningIntent, 'id'>) => string;
  /**
   * Deletes the opening. T1e: `withTwin` deletes its twin too (one undo step); otherwise the twin stays and loses
   * its `linkId`.
   */
  removeOpening: (id: string, opts?: { withTwin?: boolean }) => void;
  /**
   * A user edit of the placed opening (drag, resize, panel inputs). Position updates (`offsetX`/`sill`/`wallId`)
   * are clamped to the wall and re-anchored with `anchorFromRect`. A size-only update keeps the anchor when the new
   * size fits there (a centred door stays centred), else it is clamped and re-anchored too. `anchor` sets it directly.
   */
  updateOpening: (id: string, updates: OpeningUpdate) => void;
  /**
   * T1c: moves an opening to a new position (drag; the caller has snapped it). Clamped to the wall, then anchored with
   * `anchorFromRect`: a bay / axis anchor, or the wall start when `free` (snapping off).
   */
  moveOpening: (id: string, pos: Pick<Opening, 'offsetX' | 'sill'>, opts?: { free?: boolean }) => void;
  /**
   * T1c: "Centrează în travee" (`'bay'`: `{ kind: 'bay', offset: 'centre' }`, side walls only) and "Centrează pe
   * perete" (`'wall'`: `{ kind: 'axis', fromCentre: 0 }` on end walls, the wall's middle on side walls).
   * Returns false when the mode does not apply to the wall.
   */
  centreOpening: (id: string, mode: 'bay' | 'wall') => boolean;
  setSnapEnabled: (v: boolean) => void;
  setSnapGuides: (v: { wallId: WallId; guides: SnapGuide[] } | null) => void;
  /** Sets intent fields directly (no clamping beyond the wall-independent rules). For T1c–T1e tools. */
  updateIntent: (id: string, updates: Partial<Omit<OpeningIntent, 'id'>>) => void;
  /** "Reașază automat": moves (and, as a last resort, shrinks) the opening to the nearest valid spot. */
  autoPlaceOpening: (id: string) => boolean;
  /** T1d: copies the opening and starts paste mode (each click on a bay places a copy). False when it is unknown. */
  copyOpening: (id: string) => boolean;
  /**
   * T1d: Ctrl/⌘+V: a copy of `clipboard` in the next free spot after the selected opening (on its wall), or after the
   * copied one when nothing is selected. Selects and returns the new id; null (and `message`) when the wall is full.
   */
  pasteOpening: () => string | null;
  /** T1d: Ctrl/⌘+D / "Duplică": a copy in the next free spot of the same wall. Null (and `message`) when it is full. */
  duplicateOpening: (id: string) => string | null;
  /** T1d: "Repetă" along a side wall (one undo step). Null on end walls or for an unknown id. */
  repeatOpening: (id: string, pattern: RepeatPattern) => RepeatResult | null;
  showMessage: (text: string) => void;
  dismissMessage: () => void;
  /** T1e: the symmetry mode for new placements (existing items get no twins). */
  setSymmetry: (mode: SymmetryMode) => void;
  setActiveTool: (tool: OpeningType | null) => void;
  selectOpening: (id: string | null) => void;
  setIsDragging: (v: boolean) => void;
  setHoveredWallId: (wallId: WallId | null) => void;
  clearHoveredWallId: () => void;
  /** The walls of the rendered hall changed: re-place every intent (the intents themselves are untouched). */
  setWallSpans: (spans: WallSpans) => void;
  /** Replaces all openings from untrusted data (shared links, models). Accepts v0, v1 and v2 shapes. */
  setOpenings: (openings: ReadonlyArray<Opening | LegacyOpening | OpeningIntent>) => void;
  /**
   * Replaces the intents with a trusted list (undo/redo). `hall`: the hall they belong to, so they are placed on it
   * right away and the following `setWallSpans` of the same hall raises no notice.
   */
  restoreIntents: (intents: readonly OpeningIntent[], hall?: HallState) => void;
  dismissRelayoutNotice: () => void;
  resetOpenings: () => void;
}

/** Wall spans derived from the hall dimensions in the configurator store. */
function spansFromConfigurator(): WallSpans {
  return spansFromHallState(useConfiguratorStore.getState());
}

/**
 * The hall for migrating persisted openings. The configurator store rehydrates later (skipHydration), so read its
 * persisted hall straight from storage; fall back to the store's current state.
 */
function spansForMigration(): WallSpans {
  try {
    const raw = globalThis.localStorage?.getItem(CONFIGURATOR_STORAGE_KEY);
    const state = raw ? (JSON.parse(raw) as { state?: Partial<HallState> }).state : undefined;
    if (state && [state.width, state.height, state.length].every((v) => typeof v === 'number')) {
      return spansFromHallState({ ...useConfiguratorStore.getState(), ...state } as HallState);
    }
  } catch {
    // Unreadable storage: use the store.
  }
  return spansFromConfigurator();
}

/** Same wall spans (compared by value), so a re-render of the engine does not re-place anything. */
const sameSpans = (a: WallSpans | null, b: WallSpans) => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** For F: `useOpeningsStore(selectHasOpeningConflicts)` disables "Continuă" while true (E7). */
export const selectHasOpeningConflicts = (s: { conflicts: OpeningConflict[] }) => s.conflicts.length > 0;

const newId = () => nanoid();

/** Placed openings, placement status and conflicts of `intents` on `spans`. */
function derive(intents: readonly OpeningIntent[], spans: WallSpans) {
  const { openings, status } = placeAll(intents, spans);
  const unfit = Object.keys(status).filter((id) => !status[id].fits);
  return { openings, placement: status, conflicts: validateOpenings(openings, spans, unfit) };
}

const affected = (status: Record<string, PlacementStatus>) =>
  new Set(Object.keys(status).filter((id) => status[id].moved || !status[id].fits));

/** Size and sill under the wall-independent rules only (min size, doors on the floor). */
function sanitizeSize<T extends Pick<OpeningIntent, 'type' | 'wallId' | 'sill' | 'width' | 'height'>>(i: T): T {
  const r = clampOpening({ id: '', type: i.type, wallId: i.wallId, offsetX: 0, sill: i.sill, width: i.width, height: i.height });
  return { ...i, sill: r.sill, width: r.width, height: r.height };
}

let _clearHoverTimeout: ReturnType<typeof setTimeout> | null = null;

const initialDerived = { openings: [] as Opening[], placement: {}, conflicts: [] as OpeningConflict[] };

export const useOpeningsStore = create<OpeningsState>()(
  persist(
    (set, get) => {
      const spansNow = () => get().wallSpans ?? spansFromConfigurator();
      /** Replace the intents and re-derive everything from them. */
      const commit = (intents: OpeningIntent[], extra: Partial<OpeningsState> = {}) =>
        set({ intents, ...derive(intents, spansNow()), ...extra });
      /** Adds new intents in one commit (one undo step); returns their ids. */
      const addNew = (news: readonly NewIntent[], extraIntents: (list: OpeningIntent[]) => OpeningIntent[] = (l) => l) => {
        const added = news.map((n) => sanitizeSize({ ...n, id: newId() }));
        const intents = extraIntents([...get().intents, ...withTwins(added)]);
        return { intents, ids: added.map((a) => a.id) };
      };
      const showMessage = (text: string) => set({ message: { text, seq: (get().message?.seq ?? 0) + 1 } });
      /** T1e: `added` (new intents) plus a linked twin for each that gets one under the current symmetry mode. */
      const withTwins = (added: readonly OpeningIntent[]): OpeningIntent[] => {
        const mode = get().symmetry;
        if (mode === 'none') return [...added];
        const spans = spansNow();
        return added.flatMap((a) => {
          const twin = twinFor(a, mode, spans);
          if (!twin) return [a];
          const linkId = newId();
          return [{ ...a, linkId }, { ...twin, id: newId(), linkId }];
        });
      };
      /** T1e: `list` with the twin of `id` following it (mirrored). */
      const synced = (list: OpeningIntent[], id: string) => syncTwin(list, id, spansNow());

      return {
        intents: [],
        ...initialDerived,
        activeTool: null,
        selectedOpeningId: null,
        isDragging: false,
        hoveredWallId: null,
        wallSpans: null,
        relayoutNotice: null,
        snapEnabled: true,
        snapGuides: null,
        clipboard: null,
        pasting: false,
        message: null,
        symmetry: 'none',

        addOpening: (opening, opts = {}) => {
          const id = newId();
          const span = spansNow()[opening.wallId];
          const rect = clampOpening({ ...opening, id }, span);
          let intent = intentFromRect({ ...opening, id }, rect, span, opts);
          if (opening.anchor && anchorFitsWall(opening.anchor, opening.wallId)) intent = { ...intent, anchor: opening.anchor };
          if (snapsToAxis(intent.type, intent.wallId, get().symmetry)) {
            const centred: OpeningIntent = { ...intent, anchor: { kind: 'axis', fromCentre: 0 } };
            if (placeOpening(centred, span).fits) intent = centred;
          }
          commit([...get().intents, ...withTwins([intent])], { selectedOpeningId: id });
          return id;
        },

        addIntent: (intent) => {
          const id = newId();
          commit([...get().intents, sanitizeSize({ ...intent, id })], { selectedOpeningId: id });
          return id;
        },

        removeOpening: (id, opts = {}) => {
          const { intents, selectedOpeningId } = get();
          const twin = twinOf(intents, id);
          const gone = new Set([id, ...(opts.withTwin && twin ? [twin.id] : [])]);
          const kept = intents
            .filter((o) => !gone.has(o.id))
            .map((o) => (twin && o.id === twin.id ? { ...o, linkId: undefined } : o));
          commit(kept, { selectedOpeningId: selectedOpeningId && gone.has(selectedOpeningId) ? null : selectedOpeningId });
        },

        updateOpening: (id, updates) => {
          const { intents, openings } = get();
          const intent = intents.find((o) => o.id === id);
          const placed = openings.find((o) => o.id === id);
          if (!intent || !placed) return;
          const spans = spansNow();
          const merged: Opening = { ...placed, ...updates, id };
          const span = spans[merged.wallId];

          let next: OpeningIntent;
          if (updates.anchor && anchorFitsWall(updates.anchor, merged.wallId)) {
            next = sanitizeSize({ ...intent, type: merged.type, wallId: merged.wallId, anchor: updates.anchor, sill: merged.sill, width: merged.width, height: merged.height });
          } else {
            const sizeOnly = updates.offsetX === undefined && updates.wallId === undefined;
            const kept = sanitizeSize({ ...intent, type: merged.type, sill: merged.sill, width: merged.width, height: merged.height });
            if (sizeOnly && placeOpening(kept, span).fits) {
              next = kept;
            } else {
              const rect = clampOpening(merged, span);
              const base = { id, type: merged.type, wallId: merged.wallId, linkId: intent.linkId };
              next = intentFromRect(base, rect, span, { free: intent.anchor.kind === 'wallStart' });
            }
          }
          commit(synced(intents.map((o) => (o.id === id ? next : o)), id));
        },

        moveOpening: (id, pos, opts = {}) => {
          const { intents, openings } = get();
          const intent = intents.find((o) => o.id === id);
          const placed = openings.find((o) => o.id === id);
          if (!intent || !placed) return;
          const span = spansNow()[placed.wallId];
          const rect = clampOpening({ ...placed, offsetX: pos.offsetX, sill: pos.sill }, span);
          const base = { id, type: intent.type, wallId: intent.wallId, linkId: intent.linkId };
          const next = intentFromRect(base, rect, span, { free: opts.free ?? false });
          commit(synced(intents.map((o) => (o.id === id ? next : o)), id));
        },

        centreOpening: (id, mode) => {
          const { intents, openings } = get();
          const intent = intents.find((o) => o.id === id);
          const placed = openings.find((o) => o.id === id);
          if (!intent || !placed) return false;
          const span = spansNow()[placed.wallId];
          const anchor =
            mode === 'bay' ? centreInBayAnchor(placed, span, placed.wallId) : centreOnWallAnchor(placed, span, placed.wallId);
          if (!anchor) return false;
          commit(synced(intents.map((o) => (o.id === id ? { ...o, anchor } : o)), id));
          return true;
        },

        setSnapEnabled: (v) => set({ snapEnabled: v }),

        setSnapGuides: (v) => set({ snapGuides: v }),

        updateIntent: (id, updates) => {
          const intents = get().intents.map((o) => {
            if (o.id !== id) return o;
            const next = sanitizeSize({ ...o, ...updates, id });
            return anchorFitsWall(next.anchor, next.wallId) ? next : o;
          });
          commit(synced(intents, id));
        },

        autoPlaceOpening: (id) => {
          const { intents } = get();
          const intent = intents.find((o) => o.id === id);
          if (!intent) return false;
          const next = autoPlace(intent, intents, spansNow());
          if (!next) return false;
          commit(intents.map((o) => (o.id === id ? next : o)));
          return true;
        },

        copyOpening: (id) => {
          const intent = get().intents.find((o) => o.id === id);
          if (!intent) return false;
          // Paste mode keeps the selection: Ctrl/⌘+V pastes after it.
          set({ clipboard: clipboardOf(intent), pasting: true, activeTool: intent.type });
          return true;
        },

        pasteOpening: () => {
          const { clipboard, openings, selectedOpeningId } = get();
          if (!clipboard) return null;
          const spans = spansNow();
          const selected = openings.find((o) => o.id === selectedOpeningId);
          const wallId = selected?.wallId ?? clipboard.wallId;
          const ref = selected ?? { ...placeOpening(clipboard, spans[clipboard.wallId]).rect, anchor: clipboard.anchor };
          const spot = nextFreeSpot(clipboard, wallId, ref, openings, spans[wallId]);
          if (!spot) {
            showMessage(NO_ROOM_MESSAGE);
            return null;
          }
          const { intents, ids } = addNew([spot]);
          commit(intents, { selectedOpeningId: ids[0] });
          return ids[0];
        },

        duplicateOpening: (id) => {
          const { intents: all, openings } = get();
          const intent = all.find((o) => o.id === id);
          const placed = openings.find((o) => o.id === id);
          if (!intent || !placed) return null;
          const span = spansNow()[intent.wallId];
          const spot = nextFreeSpot(clipboardOf(intent), intent.wallId, placed, openings, span);
          if (!spot) {
            showMessage(NO_ROOM_MESSAGE);
            return null;
          }
          const { intents, ids } = addNew([spot]);
          commit(intents, { selectedOpeningId: ids[0] });
          return ids[0];
        },

        repeatOpening: (id, pattern) => {
          const { intents: all, openings } = get();
          const intent = all.find((o) => o.id === id);
          const placed = openings.find((o) => o.id === id);
          if (!intent || !placed) return null;
          const plan = planRepeat(intent, placed, pattern, openings, spansNow()[intent.wallId]);
          if (!plan) return null;
          const move = plan.move;
          const { intents } = addNew(plan.add, (list) =>
            move ? synced(list.map((o) => (o.id === id ? { ...o, anchor: move } : o)), id) : list,
          );
          commit(intents);
          return { added: plan.add.length, skipped: plan.skipped };
        },

        showMessage,

        dismissMessage: () => set({ message: null }),

        setSymmetry: (mode) => set({ symmetry: mode }),

        setActiveTool: (tool) => set({ activeTool: tool, selectedOpeningId: null, pasting: false }),

        selectOpening: (id) => set({ selectedOpeningId: id }),

        setIsDragging: (v) => set({ isDragging: v }),

        setHoveredWallId: (wallId) => {
          if (_clearHoverTimeout) {
            clearTimeout(_clearHoverTimeout);
            _clearHoverTimeout = null;
          }
          set({ hoveredWallId: wallId });
        },

        clearHoveredWallId: () => {
          if (_clearHoverTimeout) clearTimeout(_clearHoverTimeout);
          _clearHoverTimeout = setTimeout(() => {
            set({ hoveredWallId: null });
          }, 150);
        },

        // T1a: a change of the hall re-places every intent; nothing is written back into the intents, so growing
        // the hall back restores every position. What no longer fits shows up as a 'fit' conflict.
        setWallSpans: (spans) =>
          set((state) => {
            if (sameSpans(state.wallSpans, spans)) return {};
            const next = derive(state.intents, spans);
            let relayoutNotice = state.relayoutNotice;
            if (state.wallSpans !== null) {
              const before = affected(state.placement);
              const now = affected(next.placement);
              if (now.size === 0) relayoutNotice = null;
              else if ([...now].some((id) => !before.has(id))) {
                const ids = [...now];
                relayoutNotice = {
                  moved: ids.filter((id) => next.placement[id].moved).length,
                  unfit: ids.filter((id) => !next.placement[id].fits).length,
                  seq: (state.relayoutNotice?.seq ?? 0) + 1,
                };
              }
            }
            return { wallSpans: spans, ...next, relayoutNotice };
          }),

        // Shared links set the hall dimensions right before this call, so derive the spans from the
        // configurator store rather than from `wallSpans`, which may belong to a previous hall.
        setOpenings: (openings) => {
          const spans = spansFromConfigurator();
          const intents = normalizeIntents(openings, spans, newId);
          set({ intents, ...derive(intents, spans), wallSpans: spans, selectedOpeningId: null, relayoutNotice: null });
        },

        restoreIntents: (intents, hall) => {
          const spans = hall ? spansFromHallState(hall) : spansNow();
          const { selectedOpeningId } = get();
          set({
            intents: [...intents],
            ...derive(intents, spans),
            wallSpans: spans,
            relayoutNotice: null,
            selectedOpeningId: intents.some((o) => o.id === selectedOpeningId) ? selectedOpeningId : null,
          });
        },

        dismissRelayoutNotice: () => set({ relayoutNotice: null }),

        resetOpenings: () =>
          set({
            intents: [],
            ...initialDerived,
            activeTool: null,
            selectedOpeningId: null,
            isDragging: false,
            hoveredWallId: null,
            relayoutNotice: null,
            snapGuides: null,
            pasting: false,
            message: null,
          }),
      };
    },
    {
      name: OPENINGS_STORAGE_KEY,
      version: OPENINGS_STORE_VERSION,
      partialize: (state) => ({ intents: state.intents }),
      // v0 → v2: normalised posX/posY; v1 → v2: metres. Both become anchors on the persisted hall (E1 duplicate
      // `opening-N` ids are repaired on the way).
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { openings?: unknown; intents?: unknown };
        if (version < 2) return { intents: normalizeIntents(p.openings, spansForMigration(), newId) };
        return { intents: p.intents };
      },
      // Persisted intents are untrusted too; the placed rectangles are derived from them.
      merge: (persisted, current) => {
        const raw = (persisted as { intents?: unknown } | null)?.intents;
        const spans = spansForMigration();
        const intents = normalizeIntents(raw, spans, newId);
        return { ...current, intents, ...derive(intents, spans) };
      },
    },
  ),
);
