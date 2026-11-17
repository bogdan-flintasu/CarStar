'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_PRICES, calculatePrice, type Prices } from '@/lib/pricing';
import {
  DEFAULT_PALETTE,
  defaultColors,
  resolveColors,
  surchargeRates,
  toChoice,
  type ColorComponent,
  type ColorOption,
  type HallColors,
} from '@/lib/colors';

export { DEFAULT_PRICES };

export type ConfigStep = 1 | 2 | 3 | 4;

interface ConfiguratorState {
  // ── Step navigation ──────────────────────────────────────
  currentStep: ConfigStep;
  setStep: (step: ConfigStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // ── Dimensions (Step 1) ──────────────────────────────────
  height: number;
  width: number;
  length: number;
  setHeight: (v: number) => void;
  setWidth: (v: number) => void;
  setLength: (v: number) => void;

  // ── Walls visibility toggle (Step 1) ─────────────────────
  /** The user's own toggle (only meaningful in step 1). */
  wallsToggle: boolean;
  /** Derived: step 1 follows the toggle, every other step shows the walls. Never set directly. */
  wallsVisible: boolean;
  setWallsVisible: (v: boolean) => void;

  // ── Panels & Foundation (Step 2) ─────────────────────────
  showFoundation: boolean;
  setShowFoundation: (v: boolean) => void;
  hasSandwichPanels: boolean;
  setHasSandwichPanels: (v: boolean) => void;
  isIsolated: boolean;
  setIsIsolated: (v: boolean) => void;
  insulation: number;
  setInsulation: (v: number) => void;

  // ── Colours (Steps 2 and 3) ──────────────────────────────
  /** Chosen colour per component; always resolved against `palette`. */
  colors: HallColors;
  setColor: (component: ColorComponent, option: ColorOption) => void;
  /**
   * Replaces all colours from a saved configuration (already resolved by the server). Missing components get the
   * defaults; the choices are checked against the catalogue again when it loads (`setPalette`).
   */
  setColors: (colors: Partial<HallColors> | undefined) => void;
  /** The admin's colour catalogue (built-in until /api/colors has loaded). Not persisted. */
  palette: ColorOption[];
  setPalette: (palette: ColorOption[]) => void;

  // ── Runtime (not persisted) ──────────────────────────────
  /** True once the hall has rendered its first frame; hides the loader. Set by the 3D scene. */
  hallReady: boolean;
  setHallReady: (v: boolean) => void;

  // ── Prices ───────────────────────────────────────────────
  prices: Prices;
  setPrices: (prices: Prices) => void;

  // ── Computed values ──────────────────────────────────────
  getFloorArea: () => number;
  getNumberOfBays: () => number;
  getEstimatedPrice: (openingsCount: { windows: number; doors: number; garageDoors: number }) => number;

  // ── Configuration export ─────────────────────────────────
  getConfigurationData: (openingsCount: { windows: number; doors: number; garageDoors: number }) => Record<string, unknown>;
  resetConfigurator: () => void;
}

const deriveWalls = (step: ConfigStep, toggle: boolean) => step !== 1 || toggle;

/** Bump when the persisted shape changes; `migrate` below must handle older versions. */
const STORE_VERSION = 1;

export const useConfiguratorStore = create<ConfiguratorState>()(
  persist(
    (set, get) => ({
  // ── Step navigation ──────────────────────────────────────
  currentStep: 1,
  setStep: (step) => set((s) => ({ currentStep: step, wallsVisible: deriveWalls(step, s.wallsToggle) })),
  nextStep: () =>
    set((s) => {
      const next = Math.min(4, s.currentStep + 1) as ConfigStep;
      return { currentStep: next, wallsVisible: deriveWalls(next, s.wallsToggle) };
    }),
  prevStep: () =>
    set((s) => {
      const prev = Math.max(1, s.currentStep - 1) as ConfigStep;
      return { currentStep: prev, wallsVisible: deriveWalls(prev, s.wallsToggle) };
    }),

  // ── Dimensions ───────────────────────────────────────────
  height: 3,
  width: 12,
  length: 12,
  setHeight: (v) => set({ height: v }),
  setWidth: (v) => set({ width: v }),
  setLength: (v) => set({ length: v }),

  // ── Walls visibility ────────────────────────────────────
  wallsToggle: false,
  wallsVisible: false,
  setWallsVisible: (v) => set((s) => ({ wallsToggle: v, wallsVisible: deriveWalls(s.currentStep, v) })),

  hallReady: false,
  setHallReady: (v) => set({ hallReady: v }),

  // ── Panels & Foundation ─────────────────────────────────
  showFoundation: true,
  setShowFoundation: (v) => set({ showFoundation: v }),
  hasSandwichPanels: false,
  setHasSandwichPanels: (v) => set({ hasSandwichPanels: v }),
  isIsolated: false,
  setIsIsolated: (v) => set({ isIsolated: v }),
  insulation: 30,
  setInsulation: (v) => set({ insulation: v }),

  // ── Colours ─────────────────────────────────────────────
  colors: defaultColors(),
  setColor: (component, option) => set((s) => ({ colors: { ...s.colors, [component]: toChoice(option) } })),
  setColors: (colors) => set((s) => ({ colors: { ...defaultColors(s.palette), ...colors } })),
  palette: [...DEFAULT_PALETTE],
  // A choice the new catalogue no longer offers falls back to its default; names/hexes follow the catalogue.
  setPalette: (palette) => set((s) => ({ palette, colors: resolveColors(s.colors, palette) })),

  // ── Prices ──────────────────────────────────────────────
  prices: DEFAULT_PRICES,
  setPrices: (prices) => set({ prices }),

  // ── Computed ────────────────────────────────────────────
  getFloorArea: () => {
    const { length, width } = get();
    return length * width;
  },

  getNumberOfBays: () => {
    const { length } = get();
    return Math.ceil(length / 6 - 1e-9); // matches the engine's bay count (ceil)
  },

  getEstimatedPrice: (openingsCount) => {
    const { length, width, height, showFoundation, hasSandwichPanels, prices, colors, palette } = get();
    return calculatePrice(
      { length, width, height, showFoundation, hasSandwichPanels },
      openingsCount,
      prices,
      surchargeRates(colors, palette),
    );
  },

  getConfigurationData: (openingsCount) => {
    const s = get();
    return {
      dimensions: { length: s.length, width: s.width, height: s.height },
      floorArea: s.getFloorArea(),
      numberOfBays: s.getNumberOfBays(),
      foundation: s.showFoundation,
      sandwichPanels: s.hasSandwichPanels,
      insulation: s.isIsolated ? s.insulation : 0,
      openings: openingsCount,
      colors: s.colors,
      estimatedPrice: s.getEstimatedPrice(openingsCount),
    };
  },

  resetConfigurator: () => {
    set({
      currentStep: 1,
      height: 3,
      width: 12,
      length: 12,
      wallsToggle: false,
      wallsVisible: false,
      showFoundation: true,
      hasSandwichPanels: false,
      isIsolated: false,
      insulation: 30,
      colors: defaultColors(get().palette),
    });
  },
    }),
    {
      name: 'carstar-configurator-storage',
      version: STORE_VERSION,
      // Rehydrated manually from the configurator layout so the shell can render on the server.
      skipHydration: true,
      // Only the user's choices; never prices, step or derived flags.
      partialize: (s) => ({
        height: s.height, width: s.width, length: s.length,
        wallsToggle: s.wallsToggle,
        showFoundation: s.showFoundation, hasSandwichPanels: s.hasSandwichPanels,
        isIsolated: s.isIsolated, insulation: s.insulation,
        colors: s.colors,
      }),
      migrate: (persisted) => {
        // v0 persisted everything (prices, step, wallsVisible); drop what is no longer stored.
        const rest = { ...((persisted ?? {}) as Record<string, unknown>) };
        delete rest.prices;
        delete rest.currentStep;
        delete rest.wallsVisible;
        return rest as never;
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as object) } as ConfiguratorState;
        return { ...merged, wallsVisible: deriveWalls(merged.currentStep, merged.wallsToggle) };
      },
    }
  )
);
