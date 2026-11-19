'use client';

/**
 * The live view's quality state: the user's mode ("Calitate: Auto / Ridicată"), the level the governor asks for, and
 * the settings actually applied (held back while an offscreen render runs, see qualityController.tsx).
 * The mode is a per-browser preference in localStorage (read after mount, so server and client render the same).
 */
import { create } from 'zustand';
import { getGraphicsSettings } from '@/lib/hardwareTier';
import { qualityLadder, type LiveQuality } from './quality';
import type { HallCost } from './qualityLod';

/** `auto`: the governor adapts. `high`: the device tier's settings, never lowered. */
export type QualityMode = 'auto' | 'high';

const MODE_KEY = 'hall-quality-mode';

let ladder: LiveQuality[] | null = null;
/** The levels for this device (computed once, on first use in the browser). */
export function getQualityLadder(): LiveQuality[] {
  if (ladder) return ladder;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  const computed = qualityLadder(getGraphicsSettings(), dpr);
  if (typeof window !== 'undefined') ladder = computed;
  return computed;
}

interface QualityState {
  mode: QualityMode;
  /** Level asked for (0 = best); in `high` mode always 0. */
  level: number;
  /** Settings the live view draws with; null until the controller applies the first one (then level 0 is used). */
  live: LiveQuality | null;
  /** Estimated cost of the hall on screen (Hall.tsx), all detail drawn. */
  cost: HallCost | null;
  setMode: (mode: QualityMode) => void;
  setLevel: (level: number) => void;
  setLive: (live: LiveQuality) => void;
  setCost: (cost: HallCost) => void;
}

export const useQualityStore = create<QualityState>()((set) => ({
  mode: 'auto',
  level: 0,
  live: null,
  cost: null,
  setMode: (mode) => {
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Storage blocked (private window): the choice lasts for this page only.
    }
    set({ mode, level: 0 });
  },
  setLevel: (level) => set({ level }),
  setLive: (live) => set({ live }),
  setCost: (cost) => set({ cost }),
}));

/** Reads the saved mode (call after mount). */
export function loadSavedQualityMode(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(MODE_KEY);
  } catch {
    return;
  }
  if ((saved === 'auto' || saved === 'high') && saved !== useQualityStore.getState().mode) {
    useQualityStore.setState({ mode: saved, level: 0 });
  }
}

/** The settings the live view draws with now. */
export function useLiveQuality(): LiveQuality {
  return useQualityStore((s) => s.live) ?? getQualityLadder()[0];
}

/** Whether bolts and fittings are drawn out to their normal distance. */
export const farDetailNow = (): boolean => (useQualityStore.getState().live ?? getQualityLadder()[0]).farDetail;
