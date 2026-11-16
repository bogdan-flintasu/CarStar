'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import type { Opening, OpeningType, WallId, WallSpans, LegacyOpening } from '@/components/3d/openings/types';
import { clampOpening, normalizeOpenings } from '@/components/3d/openings/openingMath';
import { spansFromHallState } from '@/components/3d/openings/wallSpans';
import { validateOpenings } from '@/components/3d/openings/validateOpenings';
import type { OpeningConflict } from '@/components/3d/openings/validateOpenings';

// ─── Types ────────────────────────────────────────────────────────────────────
export type { Opening, OpeningType, WallId, WallSpan, WallSpans, LegacyOpening } from '@/components/3d/openings/types';
export type { OpeningConflict, ConflictKind } from '@/components/3d/openings/validateOpenings';
export {
  clampOpening,
  resizeOpening,
  DEFAULT_DIMENSIONS,
  MIN_OPENING_SIZE,
  isFloorStanding,
} from '@/components/3d/openings/openingMath';

/** Persisted schema version. v0: normalised posX/posY. v1: metres (offsetX/sill) + unique random ids. */
export const OPENINGS_STORE_VERSION = 1;
export const OPENINGS_STORAGE_KEY = 'carstar-openings-storage';

interface OpeningsState {
  openings: Opening[];
  activeTool: OpeningType | null;
  selectedOpeningId: string | null;
  /** True while the user is dragging/resizing an opening — disables OrbitControls */
  isDragging: boolean;
  /** True while the user hovers over the Închideri panel — shows placement markers */
  showMarkers: boolean;
  /** The wall currently hovered in the 3D scene */
  hoveredWallId: WallId | null;
  /** Wall rectangles of the rendered hall, pushed by the 3D layer (`WallOpenings`). Not persisted. */
  wallSpans: WallSpans | null;
  /** Overlaps, column/frame crossings and downpipe clashes (E7). Derived; kept in sync by every action. */
  conflicts: OpeningConflict[];

  // Actions
  /** Adds a clamped opening, selects it and returns its id. */
  addOpening: (opening: Omit<Opening, 'id'>) => string;
  removeOpening: (id: string) => void;
  /** Merges `updates` and clamps the result to its wall. */
  updateOpening: (id: string, updates: Partial<Omit<Opening, 'id'>>) => void;
  setActiveTool: (tool: OpeningType | null) => void;
  selectOpening: (id: string | null) => void;
  setIsDragging: (v: boolean) => void;
  setShowMarkers: (v: boolean) => void;
  setHoveredWallId: (wallId: WallId | null) => void;
  clearHoveredWallId: () => void;
  setWallSpans: (spans: WallSpans) => void;
  /** Replaces all openings from untrusted data (shared links). Accepts legacy and current shapes. */
  setOpenings: (openings: ReadonlyArray<Opening | LegacyOpening>) => void;
  resetOpenings: () => void;
}

/** Wall spans derived from the hall dimensions in the configurator store. */
function spansFromConfigurator(): WallSpans {
  return spansFromHallState(useConfiguratorStore.getState());
}

/** Same wall spans (compared by value), so a re-render of the engine does not re-clamp anything. */
const sameSpans = (a: WallSpans | null, b: WallSpans) => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** For F: `useOpeningsStore(selectHasOpeningConflicts)` disables "Continuă" while true (E7). */
export const selectHasOpeningConflicts = (s: { conflicts: OpeningConflict[] }) => s.conflicts.length > 0;

const newId = () => nanoid();

let _clearHoverTimeout: ReturnType<typeof setTimeout> | null = null;

export const useOpeningsStore = create<OpeningsState>()(
  persist(
    (set, get) => ({
      openings: [],
      activeTool: null,
      selectedOpeningId: null,
      isDragging: false,
      showMarkers: false,
      hoveredWallId: null,
      wallSpans: null,
      conflicts: [],

      addOpening: (opening) => {
        const id = newId();
        const spans = get().wallSpans ?? spansFromConfigurator();
        const clamped = clampOpening({ ...opening, id }, spans[opening.wallId]);
        set((state) => {
          const openings = [...state.openings, clamped];
          return { openings, selectedOpeningId: id, conflicts: validateOpenings(openings, spans) };
        });
        return id;
      },

      removeOpening: (id) =>
        set((state) => {
          const openings = state.openings.filter((o) => o.id !== id);
          return {
            openings,
            selectedOpeningId: state.selectedOpeningId === id ? null : state.selectedOpeningId,
            conflicts: validateOpenings(openings, state.wallSpans ?? spansFromConfigurator()),
          };
        }),

      updateOpening: (id, updates) =>
        set((state) => {
          const spans = state.wallSpans ?? spansFromConfigurator();
          const openings = state.openings.map((o) => {
            if (o.id !== id) return o;
            const merged: Opening = { ...o, ...updates, id };
            return clampOpening(merged, spans[merged.wallId]);
          });
          return { openings, conflicts: validateOpenings(openings, spans) };
        }),

      setActiveTool: (tool) => set({ activeTool: tool, selectedOpeningId: null }),

      selectOpening: (id) => set({ selectedOpeningId: id }),

      setIsDragging: (v) => set({ isDragging: v }),

      setShowMarkers: (v) => set({ showMarkers: v }),

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

      // E8: when the hall changes, pull every opening back inside its (new) wall. What cannot be fixed by
      // clamping (overlaps, columns, downpipes) shows up in `conflicts`.
      setWallSpans: (spans) =>
        set((state) => {
          if (sameSpans(state.wallSpans, spans)) return {};
          const openings = state.openings.map((o) => clampOpening(o, spans[o.wallId]));
          return { wallSpans: spans, openings, conflicts: validateOpenings(openings, spans) };
        }),

      // Shared links set the hall dimensions right before this call, so derive the spans from the
      // configurator store rather than from `wallSpans`, which may belong to a previous hall.
      setOpenings: (openings) => {
        const spans = spansFromConfigurator();
        const list = normalizeOpenings(openings, spans, newId);
        set({ openings: list, selectedOpeningId: null, conflicts: validateOpenings(list, spans) });
      },

      resetOpenings: () =>
        set({
          openings: [],
          conflicts: [],
          activeTool: null,
          selectedOpeningId: null,
          isDragging: false,
          showMarkers: false,
          hoveredWallId: null,
        }),
    }),
    {
      name: OPENINGS_STORAGE_KEY,
      version: OPENINGS_STORE_VERSION,
      partialize: (state) => ({ openings: state.openings }),
      // v0 → v1: normalised posX/posY → metres; repair the duplicate `opening-N` ids left by E1.
      // The configurator store is created (and hydrated from localStorage) before this module.
      migrate: (persisted) => {
        const openings = (persisted as { openings?: unknown } | null)?.openings;
        return { openings: normalizeOpenings(openings, spansFromConfigurator(), newId) };
      },
    },
  ),
);
