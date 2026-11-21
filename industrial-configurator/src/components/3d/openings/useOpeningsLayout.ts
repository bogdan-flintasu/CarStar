'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { HallLayout, WallDescriptor } from '@/lib/hall';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { layoutFromHallState } from './wallSpans';
import type { WallId } from './types';
import { selectWalking, useWalkStore } from '@/stores/useWalkStore';

/** The hall layout openings are built on: the caller's (the engine already has one), else derived from the store. */
export function useOpeningsLayout(layoutProp?: HallLayout): HallLayout {
  const hall = useConfiguratorStore(
    useShallow((s) => ({
      width: s.width,
      height: s.height,
      length: s.length,
      showFoundation: s.showFoundation,
      isIsolated: s.isIsolated,
      insulation: s.insulation,
      roofType: s.roofType,
      highSide: s.highSide,
    })),
  );
  return useMemo(() => layoutProp ?? layoutFromHallState(hall), [layoutProp, hall]);
}

/** Openings float in the air while the walls are hidden (step 1), so they follow the walls' visibility (E9). */
export function useOpeningsVisible(visibleProp?: boolean): boolean {
  const walls = useConfiguratorStore((s) => s.currentStep === 2 || s.wallsVisible);
  // The walk-through always shows the hall as built (cladding on): its doors and windows too.
  const walking = useWalkStore(selectWalking);
  return visibleProp ?? (walls || walking);
}

export function wallById(layout: HallLayout, id: WallId): WallDescriptor {
  return Object.values(layout.walls).find((w) => w.id === id)!;
}
