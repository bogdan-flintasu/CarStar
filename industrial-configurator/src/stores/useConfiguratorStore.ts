'use client';

import { create } from 'zustand';

// ─── Default Prices (fallback until loaded from API) ─────────────────────────
export const DEFAULT_PRICES = {
  structurePerM3: 45,      // €/m³
  foundationPerM2: 35,     // €/m²
  sandwichPerM2: 25,       // €/m²
  windowPerUnit: 150,      // €/buc
  doorPerUnit: 300,        // €/buc
  bigDoorPerUnit: 800,     // €/buc
};

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
  prices: typeof DEFAULT_PRICES;
  setPrices: (prices: typeof DEFAULT_PRICES) => void;

  // ── Computed values ──────────────────────────────────────
  getFloorArea: () => number;
  getNumberOfBays: () => number;
  getEstimatedPrice: (openingsCount: { windows: number; doors: number; garageDoors: number }) => number;

  // ── Configuration export ─────────────────────────────────
  getConfigurationData: (openingsCount: { windows: number; doors: number; garageDoors: number }) => Record<string, unknown>;
}

export const useConfiguratorStore = create<ConfiguratorState>((set, get) => ({
  // ── Step navigation ──────────────────────────────────────
  currentStep: 1,
  setStep: (step) => set({ currentStep: step }),
  nextStep: () =>
    set((s) => ({
      currentStep: Math.min(4, s.currentStep + 1) as ConfigStep,
    })),
  prevStep: () =>
    set((s) => ({
      currentStep: Math.max(1, s.currentStep - 1) as ConfigStep,
    })),

  // ── Dimensions ───────────────────────────────────────────
  height: 3,
  width: 12,
  length: 12,
  setHeight: (v) => set({ height: v }),
  setWidth: (v) => set({ width: v }),
  setLength: (v) => set({ length: v }),

  // ── Walls visibility ────────────────────────────────────
  wallsVisible: true,
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

    let price = length * width * height * prices.structurePerM3;
    price += openingsCount.windows * prices.windowPerUnit;
    price += openingsCount.doors * prices.doorPerUnit;
    price += openingsCount.garageDoors * prices.bigDoorPerUnit;

    if (showFoundation) {
      price += length * width * prices.foundationPerM2;
    }

    if (hasSandwichPanels) {
      // Wall area = 2 * (length * height) + 2 * (width * height)
      const wallArea = 2 * (length * height) + 2 * (width * height);
      price += wallArea * prices.sandwichPerM2;
    }

    return Math.round(price);
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
}));
