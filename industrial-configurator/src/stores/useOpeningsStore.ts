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
import type { OpeningConflict } from '@/components/3d/openings/validateOpenings';

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

  // Actions
  /**
   * Adds an opening from a rectangle (clamped to its wall: this is a user action) and selects it; returns its id.
   * The anchor comes from the rectangle (`anchorFromRect`), or from `opening.anchor` when it suits the wall.
   * `free: true` anchors it to the wall start (snapping off).
   */
  addOpening: (opening: NewOpening, opts?: { free?: boolean }) => string;
  /** Adds an intent as is (anchor, size, sill), selects it and returns its id. */
  addIntent: (intent: Omit<OpeningIntent, 'id'>) => string;
  removeOpening: (id: string) => void;
  /**
   * A user edit of the placed opening (drag, resize, panel inputs). Position updates (`offsetX`/`sill`/`wallId`)
   * are clamped to the wall and re-anchored with `anchorFromRect`. A size-only update keeps the anchor when the new
   * size fits there (a centred door stays centred), else it is clamped and re-anchored too. `anchor` sets it directly.
   */
  updateOpening: (id: string, updates: OpeningUpdate) => void;
  /** Sets intent fields directly (no clamping beyond the wall-independent rules). For T1c–T1e tools. */
  updateIntent: (id: string, updates: Partial<Omit<OpeningIntent, 'id'>>) => void;
  /** "Reașază automat": moves (and, as a last resort, shrinks) the opening to the nearest valid spot. */
  autoPlaceOpening: (id: string) => boolean;
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

      return {
        intents: [],
        ...initialDerived,
        activeTool: null,
        selectedOpeningId: null,
        isDragging: false,
        hoveredWallId: null,
        wallSpans: null,
        relayoutNotice: null,

        addOpening: (opening, opts = {}) => {
          const id = newId();
          const span = spansNow()[opening.wallId];
          const rect = clampOpening({ ...opening, id }, span);
          let intent = intentFromRect({ ...opening, id }, rect, span, opts);
          if (opening.anchor && anchorFitsWall(opening.anchor, opening.wallId)) intent = { ...intent, anchor: opening.anchor };
          commit([...get().intents, intent], { selectedOpeningId: id });
          return id;
        },

        addIntent: (intent) => {
          const id = newId();
          commit([...get().intents, sanitizeSize({ ...intent, id })], { selectedOpeningId: id });
          return id;
        },

        removeOpening: (id) => {
          const { intents, selectedOpeningId } = get();
          commit(
            intents.filter((o) => o.id !== id),
            { selectedOpeningId: selectedOpeningId === id ? null : selectedOpeningId },
          );
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
          commit(intents.map((o) => (o.id === id ? next : o)));
        },

        updateIntent: (id, updates) => {
          const intents = get().intents.map((o) => {
            if (o.id !== id) return o;
            const next = sanitizeSize({ ...o, ...updates, id });
            return anchorFitsWall(next.anchor, next.wallId) ? next : o;
          });
          commit(intents);
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

        setActiveTool: (tool) => set({ activeTool: tool, selectedOpeningId: null }),

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
