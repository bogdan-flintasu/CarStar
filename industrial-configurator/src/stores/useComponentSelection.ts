'use client';

/**
 * The hall component the user clicked (T5b): one at a time, never together with a selected opening.
 *   - `select(c)` clears the opening selection;
 *   - selecting an opening (or picking an opening tool) clears the component.
 * Not persisted: a selection is a moment of the session, not part of the configuration.
 */
import { create } from 'zustand';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import type { PickedComponent } from '@/components/3d/hall/ComponentPicker.map';

export type { PickedComponent } from '@/components/3d/hall/ComponentPicker.map';

interface ComponentSelectionState {
  selected: PickedComponent | null;
  select: (component: PickedComponent) => void;
  clear: () => void;
}

export const useComponentSelection = create<ComponentSelectionState>()((set) => ({
  selected: null,
  select: (component) => {
    if (useOpeningsStore.getState().selectedOpeningId !== null) useOpeningsStore.getState().selectOpening(null);
    set({ selected: component });
  },
  clear: () => set({ selected: null }),
}));

// Mutual exclusion, the other way: an opening selected, or an opening tool picked, drops the component.
useOpeningsStore.subscribe((now, before) => {
  const openingSelected = now.selectedOpeningId !== null && now.selectedOpeningId !== before.selectedOpeningId;
  const toolPicked = now.activeTool !== null && now.activeTool !== before.activeTool;
  if ((openingSelected || toolPicked) && useComponentSelection.getState().selected !== null) {
    useComponentSelection.getState().clear();
  }
});
