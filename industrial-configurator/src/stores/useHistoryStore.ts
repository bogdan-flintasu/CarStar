'use client';

// Undo/redo (T1a) of the hall's dimensions and shape plus the opening intents.
//
// The recorder watches both stores. One entry per user action:
// - hall fields (sliders, toggles) are coalesced: an entry is committed after HALL_COALESCE_MS without a change;
// - opening intents (add, remove, auto-place, panel edits) commit at once; a drag or resize commits on its end.
// Undo/redo apply a snapshot through the configurator's public setters and `restoreIntents`; the snapshot then equals
// the current state, so applying never records itself.

import { create } from 'zustand';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import type { OpeningIntent } from '@/components/3d/openings/types';
import type { RoofType, Side } from '@/lib/hall';

/** The configurator fields an undo restores. */
export interface HallSnapshot {
  width: number;
  height: number;
  length: number;
  roofType: RoofType;
  highSide: Side;
  showFoundation: boolean;
  isIsolated: boolean;
  insulation: number;
}

export interface HistorySnapshot {
  hall: HallSnapshot;
  intents: readonly OpeningIntent[];
}

export const HISTORY_LIMIT = 100;
/** A slider drag is one entry: it is committed once the hall has not changed for this long. */
export const HALL_COALESCE_MS = 400;

interface HistoryState {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Forget everything and start again from the current state (a hall was loaded). */
  reset: () => void;
}

const hallOf = (s: ReturnType<typeof useConfiguratorStore.getState>): HallSnapshot => ({
  width: s.width,
  height: s.height,
  length: s.length,
  roofType: s.roofType,
  highSide: s.highSide,
  showFoundation: s.showFoundation,
  isIsolated: s.isIsolated,
  insulation: s.insulation,
});

const current = (): HistorySnapshot => ({
  hall: hallOf(useConfiguratorStore.getState()),
  intents: useOpeningsStore.getState().intents,
});

const sameHall = (a: HallSnapshot, b: HallSnapshot) =>
  (Object.keys(a) as (keyof HallSnapshot)[]).every((k) => a[k] === b[k]);
const sameIntents = (a: readonly OpeningIntent[], b: readonly OpeningIntent[]) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);
const sameSnapshot = (a: HistorySnapshot, b: HistorySnapshot) => sameHall(a.hall, b.hall) && sameIntents(a.intents, b.intents);

// Recorder state. Module level: there is one history per page.
let present: HistorySnapshot | null = null;
let hallTimer: ReturnType<typeof setTimeout> | null = null;
let applying = false;

const cancelHallTimer = () => {
  if (hallTimer) clearTimeout(hallTimer);
  hallTimer = null;
};

/** The configurator store persists with `skipHydration`; until it has rehydrated, its changes are not user actions. */
const configuratorHydrated = () => {
  const p = (useConfiguratorStore as { persist?: { hasHydrated: () => boolean } }).persist;
  return !p || p.hasHydrated();
};

export const useHistoryStore = create<HistoryState>()((set, get) => {
  const publish = (past: HistorySnapshot[], future: HistorySnapshot[]) =>
    set({ past, future, canUndo: past.length > 0, canRedo: future.length > 0 });

  const apply = (snap: HistorySnapshot) => {
    applying = true;
    try {
      const hall = useConfiguratorStore.getState();
      const h = snap.hall;
      if (hall.width !== h.width) hall.setWidth(h.width);
      if (hall.height !== h.height) hall.setHeight(h.height);
      if (hall.length !== h.length) hall.setLength(h.length);
      if (hall.roofType !== h.roofType) hall.setRoofType(h.roofType);
      if (hall.highSide !== h.highSide) hall.setHighSide(h.highSide);
      if (hall.showFoundation !== h.showFoundation) hall.setShowFoundation(h.showFoundation);
      if (hall.isIsolated !== h.isIsolated) hall.setIsIsolated(h.isIsolated);
      if (hall.insulation !== h.insulation) hall.setInsulation(h.insulation);
      useOpeningsStore.getState().restoreIntents(snap.intents, h);
    } finally {
      applying = false;
    }
    present = current();
  };

  return {
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,

    undo: () => {
      commitNow();
      const { past, future } = get();
      if (past.length === 0 || !present) return;
      const target = past[past.length - 1];
      const now = present;
      apply(target);
      publish(past.slice(0, -1), [now, ...future]);
    },

    redo: () => {
      commitNow();
      const { past, future } = get();
      if (future.length === 0 || !present) return;
      const [target, ...rest] = future;
      const now = present;
      apply(target);
      publish([...past, now].slice(-HISTORY_LIMIT), rest);
    },

    reset: () => {
      cancelHallTimer();
      present = current();
      publish([], []);
    },
  };
});

/** Commits the current state as a new entry, if it differs from the last one. */
function commitNow() {
  cancelHallTimer();
  const snap = current();
  if (!present) {
    present = snap;
    return;
  }
  if (sameSnapshot(snap, present)) return;
  const { past } = useHistoryStore.getState();
  const nextPast = [...past, present].slice(-HISTORY_LIMIT);
  present = snap;
  useHistoryStore.setState({ past: nextPast, future: [], canUndo: true, canRedo: false });
}

let stopRecording: (() => void) | null = null;

/**
 * Starts watching the configurator and openings stores (idempotent). Returns a function that stops it.
 * Mount once per page (`useHistoryRecorder`).
 */
export function startHistoryRecording(): () => void {
  if (stopRecording) return stopRecording;
  present = current();

  const rebaseline = () => {
    cancelHallTimer();
    present = current();
  };

  const unsubHall = useConfiguratorStore.subscribe((s, prev) => {
    if (applying || !present) return;
    if (sameHall(hallOf(s), hallOf(prev))) return;
    if (!configuratorHydrated()) return rebaseline();
    cancelHallTimer();
    hallTimer = setTimeout(commitNow, HALL_COALESCE_MS);
  });

  const unsubOpenings = useOpeningsStore.subscribe((s, prev) => {
    if (applying || !present) return;
    if (prev.isDragging && !s.isDragging) return commitNow();
    if (s.intents === prev.intents || s.isDragging) return;
    commitNow();
  });

  const persistApi = (useConfiguratorStore as { persist?: { onFinishHydration: (fn: () => void) => () => void } }).persist;
  const unsubHydration = persistApi?.onFinishHydration(() => {
    rebaseline();
    useHistoryStore.getState().reset();
  });

  stopRecording = () => {
    unsubHall();
    unsubOpenings();
    unsubHydration?.();
    cancelHallTimer();
    stopRecording = null;
    present = null;
  };
  return stopRecording;
}
