'use client';

import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────
export type OpeningType = 'window' | 'door' | 'garageDoor';
export type WallId = 'PereteSTG' | 'PereteDR' | 'PereteFata' | 'PereteSpate';

export interface Opening {
  id: string;
  type: OpeningType;
  wallId: WallId;
  /** Normalized horizontal position on wall surface (0–1) */
  posX: number;
  /** Normalized vertical position on wall surface (0–1) */
  posY: number;
  /** Width in meters */
  width: number;
  /** Height in meters */
  height: number;
}

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

  // Actions
  addOpening: (opening: Omit<Opening, 'id'>) => void;
  removeOpening: (id: string) => void;
  updateOpening: (id: string, updates: Partial<Omit<Opening, 'id'>>) => void;
  setActiveTool: (tool: OpeningType | null) => void;
  selectOpening: (id: string | null) => void;
  setIsDragging: (v: boolean) => void;
  setShowMarkers: (v: boolean) => void;
  setHoveredWallId: (wallId: WallId | null) => void;
  clearHoveredWallId: () => void;
}

// ─── Default dimensions per type ──────────────────────────────────────────────
export const DEFAULT_DIMENSIONS: Record<OpeningType, { width: number; height: number }> = {
  window: { width: 1, height: 1 },
  door: { width: 1, height: 2.1 },
  garageDoor: { width: 3, height: 3 },
};

let _nextId = 1;
let _clearHoverTimeout: NodeJS.Timeout | null = null;

export const useOpeningsStore = create<OpeningsState>((set) => ({
  openings: [],
  activeTool: null,
  selectedOpeningId: null,
  isDragging: false,
  showMarkers: false,
  hoveredWallId: null,

  addOpening: (opening) =>
    set((state) => ({
      openings: [
        ...state.openings,
        { ...opening, id: `opening-${_nextId++}` },
      ],
      // Auto-select the newly placed opening
      selectedOpeningId: `opening-${_nextId - 1}`,
    })),

  removeOpening: (id) =>
    set((state) => ({
      openings: state.openings.filter((o) => o.id !== id),
      selectedOpeningId: state.selectedOpeningId === id ? null : state.selectedOpeningId,
    })),

  updateOpening: (id, updates) =>
    set((state) => ({
      openings: state.openings.map((o) =>
        o.id === id ? { ...o, ...updates } : o
      ),
    })),

  setActiveTool: (tool) =>
    set(() => ({
      activeTool: tool,
      // Deselect any selected opening when switching tools
      selectedOpeningId: null,
    })),

  selectOpening: (id) =>
    set(() => ({
      selectedOpeningId: id,
    })),

  setIsDragging: (v) =>
    set(() => ({ isDragging: v })),

  setShowMarkers: (v) =>
    set(() => ({ showMarkers: v })),

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
}));
