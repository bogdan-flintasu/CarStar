'use client';

import { useEffect } from 'react';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import WallOpening from './WallOpening';
import { getWallSpans } from './openings/wallSpans';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WallOpeningsProps {
  hallWidth: number;
  hallHeight: number;
  hallLength: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * Orchestrator component that renders all openings from the Zustand store.
 * Also publishes the current wall spans to the store so every mutation is clamped to its wall.
 */
export default function WallOpenings({ hallWidth, hallHeight, hallLength }: WallOpeningsProps) {
  const openings = useOpeningsStore((s) => s.openings);
  const setWallSpans = useOpeningsStore((s) => s.setWallSpans);

  // Tell the store which wall rectangles to clamp against (add/update/drag/resize).
  useEffect(() => {
    setWallSpans(getWallSpans(hallWidth, hallHeight, hallLength));
  }, [hallWidth, hallHeight, hallLength, setWallSpans]);

  return (
    <group>
      {openings.map((opening) => (
        <WallOpening
          key={opening.id}
          opening={opening}
          hallWidth={hallWidth}
          hallHeight={hallHeight}
          hallLength={hallLength}
        />
      ))}
    </group>
  );
}
