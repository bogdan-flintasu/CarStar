'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import type { Opening, OpeningType, WallId, WallSpans, LegacyOpening } from '@/components/3d/openings/types';
import { clampOpening, normalizeOpenings } from '@/components/3d/openings/openingMath';
import { getWallSpans } from '@/components/3d/openings/wallSpans';

// ─── Types ────────────────────────────────────────────────────────────────────
export type { Opening, OpeningType, WallId, WallSpan, WallSpans, LegacyOpening } from '@/components/3d/openings/types';
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
  const { width, height, length } = useConfiguratorStore.getState();
  return getWallSpans(width, height, length);
}

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

      addOpening: (opening) => {
        const id = newId();
        const spans = get().wallSpans ?? spansFromConfigurator();
        const clamped = clampOpening({ ...opening, id }, spans[opening.wallId]);
        set((state) => ({ openings: [...state.openings, clamped], selectedOpeningId: id }));
        return id;
      },

      removeOpening: (id) =>
        set((state) => ({
          openings: state.openings.filter((o) => o.id !== id),
          selectedOpeningId: state.selectedOpeningId === id ? null : state.selectedOpeningId,
        })),

      updateOpening: (id, updates) =>
        set((state) => {
          const spans = state.wallSpans ?? spansFromConfigurator();
          return {
            openings: state.openings.map((o) => {
              if (o.id !== id) return o;
              const merged: Opening = { ...o, ...updates, id };
              return clampOpening(merged, spans[merged.wallId]);
            }),
          };
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

      setWallSpans: (spans) => set({ wallSpans: spans }),

      // Shared links set the hall dimensions right before this call, so derive the spans from the
      // configurator store rather than from `wallSpans`, which may belong to a previous hall.
      setOpenings: (openings) =>
        set({
          openings: normalizeOpenings(openings, spansFromConfigurator(), newId),
          selectedOpeningId: null,
        }),

      resetOpenings: () =>
        set({
          openings: [],
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
