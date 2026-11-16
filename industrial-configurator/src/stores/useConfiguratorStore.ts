'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_PRICES, calculatePrice, type Prices } from '@/lib/pricing';

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

export const useConfiguratorStore = create<ConfiguratorState>()(
  persist(
    (set, get) => ({
  // ── Step navigation ──────────────────────────────────────
  currentStep: 1,
  setStep: (step) => set({ currentStep: step, wallsVisible: step !== 1 }),
  nextStep: () =>
    set((s) => {
      const next = Math.min(4, s.currentStep + 1) as ConfigStep;
      return {
        currentStep: next,
        wallsVisible: next !== 1,
      };
    }),
  prevStep: () =>
    set((s) => {
      const prev = Math.max(1, s.currentStep - 1) as ConfigStep;
      return {
        currentStep: prev,
        wallsVisible: prev !== 1,
      };
    }),

  // ── Dimensions ───────────────────────────────────────────
  height: 3,
  width: 12,
  length: 12,
  setHeight: (v) => set({ height: v }),
  setWidth: (v) => set({ width: v }),
  setLength: (v) => set({ length: v }),

  // ── Walls visibility ────────────────────────────────────
  wallsVisible: false,
  setWallsVisible: (v) => set({ wallsVisible: v }),

  // ── Panels & Foundation ─────────────────────────────────
  showFoundation: true,
  setShowFoundation: (v) => set({ showFoundation: v }),
  hasSandwichPanels: false,
  setHasSandwichPanels: (v) => set({ hasSandwichPanels: v }),
  isIsolated: false,
  setIsIsolated: (v) => set({ isIsolated: v }),
  insulation: 30,
  setInsulation: (v) => set({ insulation: v }),

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
    return Math.floor(length / 6); // bay span = 6m
  },

  getEstimatedPrice: (openingsCount) => {
    const { length, width, height, showFoundation, hasSandwichPanels, prices } = get();
    return calculatePrice({ length, width, height, showFoundation, hasSandwichPanels }, openingsCount, prices);
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
      estimatedPrice: s.getEstimatedPrice(openingsCount),
    };
  },

  resetConfigurator: () => {
    set({
      currentStep: 1,
      height: 3,
      width: 12,
      length: 12,
      wallsVisible: false,
      showFoundation: true,
      hasSandwichPanels: false,
      isIsolated: false,
      insulation: 30,
    });
  },
    }),
    {
      name: 'carstar-configurator-storage', // name of the item in the storage (must be unique)
    }
  )
);
