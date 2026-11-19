'use client';

import { useEffect, useMemo } from 'react';
import type { HallLayout } from '@/lib/hall';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import WallOpening from './WallOpening';
import type { HallColorHexes } from '@/lib/colors';
import { wallSpansFromLayout } from './openings/validateOpenings';
import { useOpeningsLayout, useOpeningsVisible, wallById } from './openings/useOpeningsLayout';
import SnapGuides from './openings/SnapGuides';
import { renderHiddenProps } from './hall/renders';
import { useAccentColor } from '@/components/configurator/UiThemeScope';

interface WallOpeningsProps {
  /** The engine's layout. Omit to derive it from the configurator store. */
  layout?: HallLayout;
  /** Force visibility; by default openings show whenever the walls do (E9). */
  visible?: boolean;
  /** The wall meshes already have real holes (E2): drops the depth mask. */
  realHoles?: boolean;
  /** Door and window-frame colours. */
  colors?: Pick<HallColorHexes, 'doors' | 'windows'>;
  /** @deprecated ignored: the layout carries the hall dimensions. */
  hallWidth?: number;
  /** @deprecated ignored. */
  hallHeight?: number;
  /** @deprecated ignored. */
  hallLength?: number;
}

/**
 * Renders all openings from the Zustand store.
 * Also publishes the wall spans of the layout to the store, so every mutation is clamped to its wall and the
 * openings are re-clamped and re-validated whenever the hall changes (E8).
 */
export default function WallOpenings({ layout: layoutProp, visible, realHoles = false, colors }: WallOpeningsProps) {
  const layout = useOpeningsLayout(layoutProp);
  const shown = useOpeningsVisible(visible);
  const openings = useOpeningsStore((s) => s.openings);
  const conflicts = useOpeningsStore((s) => s.conflicts);
  const setWallSpans = useOpeningsStore((s) => s.setWallSpans);
  const snapGuides = useOpeningsStore((s) => s.snapGuides);
  const accent = useAccentColor();

  // Runs even while hidden: validation must not depend on the walls being drawn.
  useEffect(() => {
    setWallSpans(wallSpansFromLayout(layout));
  }, [layout, setWallSpans]);

  const conflicting = useMemo(() => new Set(conflicts.map((c) => c.openingId)), [conflicts]);

  if (!shown) return null;
  return (
    <group>
      {openings.map((opening) => (
        <WallOpening
          key={opening.id}
          opening={opening}
          wall={wallById(layout, opening.wallId)}
          conflict={conflicting.has(opening.id)}
          realHoles={realHoles}
          colors={colors}
        />
      ))}
      {/* T1c: guides of the snaps holding during a drag. Editing feedback: never in the quote renders. */}
      {snapGuides && (
        <group {...renderHiddenProps}>
          <SnapGuides wall={wallById(layout, snapGuides.wallId)} guides={snapGuides.guides} color={accent} />
        </group>
      )}
    </group>
  );
}
