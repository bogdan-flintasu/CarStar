/**
 * The showcase hall of the landing page: a 12 × 36 m hall dressed like a real one, with a black steel frame, strip
 * windows high on the side walls, sectional industrial doors and personnel doors. The openings use the configurator's
 * own types, so they are checked by the same validation (see landingHall.test.ts).
 */
import { computeHallLayout } from '@/lib/hall';
import { DEFAULT_COLOR_HEXES, type HallColorHexes } from '@/lib/colors';
import type { Opening } from '@/components/3d/openings/types';

export const LANDING_LAYOUT = computeHallLayout({ width: 12, height: 5, length: 36, foundation: true, panels: true, insulationMm: 60 });

export const LANDING_COLORS: HallColorHexes = {
  ...DEFAULT_COLOR_HEXES,
  steel: '#0a0a0a', // RAL 9005, black
  doors: '#383e42', // RAL 7016, anthracite
  windows: '#383e42',
};

/** Frames are 6 m apart: bay `n` (1-based) of a side wall spans h = 6(n-1) … 6n, with columns at its ends. */
const mm = (v: number) => Math.round(v * 1000) / 1000;
const bayCentre = (n: number) => 6 * n - 3 + 0.07;
const strip = (wallId: 'PereteSTG' | 'PereteDR', bay: number): Opening => ({
  id: `landing-${wallId}-w${bay}`,
  type: 'window',
  wallId,
  offsetX: mm(bayCentre(bay) - 1.2),
  sill: 3,
  width: 2.4,
  height: 1.2,
});

export const LANDING_OPENINGS: readonly Opening[] = [
  // Left wall: strip windows, an industrial door in the middle bay.
  ...[1, 2, 4, 5, 6].map((bay) => strip('PereteSTG', bay)),
  { id: 'landing-left-gd', type: 'garageDoor', wallId: 'PereteSTG', offsetX: mm(bayCentre(3) - 2), sill: 0, width: 4, height: 4 },
  // Right wall: strip windows, a personnel door with a window beside it, and an industrial door.
  ...[1, 3, 4, 6].map((bay) => strip('PereteDR', bay)),
  { id: 'landing-right-door', type: 'door', wallId: 'PereteDR', offsetX: 7.4, sill: 0, width: 1, height: 2.1 },
  { id: 'landing-right-win', type: 'window', wallId: 'PereteDR', offsetX: 9.6, sill: 1, width: 1.2, height: 1.2 },
  { id: 'landing-right-gd', type: 'garageDoor', wallId: 'PereteDR', offsetX: mm(bayCentre(5) - 2), sill: 0, width: 4, height: 4 },
  // Back gable (what the camera walks towards): a wide industrial door and a personnel door.
  { id: 'landing-back-gd', type: 'garageDoor', wallId: 'PereteSpate', offsetX: 3.98, sill: 0, width: 5, height: 4.5 },
  { id: 'landing-back-door', type: 'door', wallId: 'PereteSpate', offsetX: 10.2, sill: 0, width: 1, height: 2.1 },
  // Front gable.
  { id: 'landing-front-gd', type: 'garageDoor', wallId: 'PereteFata', offsetX: 4.48, sill: 0, width: 4, height: 4.5 },
  { id: 'landing-front-door', type: 'door', wallId: 'PereteFata', offsetX: 1, sill: 0, width: 1, height: 2.1 },
];
