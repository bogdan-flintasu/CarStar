'use client';

import { useOpeningsStore } from '@/stores/useOpeningsStore';
import WallOpening from './WallOpening';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WallOpeningsProps {
  hallWidth: number;
  hallHeight: number;
  hallLength: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * Orchestrator component that renders all openings from the Zustand store.
 * Uses shallow comparison on the openings array for optimal re-render performance.
 */
export default function WallOpenings({ hallWidth, hallHeight, hallLength }: WallOpeningsProps) {
  const openings = useOpeningsStore((s) => s.openings);

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
