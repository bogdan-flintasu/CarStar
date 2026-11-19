'use client';

/**
 * The steelwork, grouped the way a hall is built: frames, purlins, bolts, rainwater goods.
 * Each kit piece is one instanced draw call, whatever the size of the hall.
 */
import { useMemo } from 'react';
import type { Material } from 'three';
import KitInstances from './KitInstances';
import type { HallKit, KitPieceName } from './kit';
import { placeBolts, type KitPlacements } from './placements';

export interface SteelProps {
  kit: HallKit;
  placements: KitPlacements;
  material: Material;
  castShadow?: boolean;
}

function Pieces({ names, kit, placements, material, castShadow }: SteelProps & { names: readonly KitPieceName[] }) {
  return names.map((name) => (
    <Piece key={name} name={name} kit={kit} placements={placements} material={material} castShadow={castShadow} />
  ));
}

function Piece({ name, kit, placements, material, castShadow }: SteelProps & { name: KitPieceName }) {
  const matrices = useMemo(() => placements[name].map((placement) => placement.matrix), [placements, name]);
  return (
    <KitInstances
      name={name}
      geometry={kit.pieces[name].geometry}
      material={material}
      matrices={matrices}
      castShadow={castShadow}
      receiveShadow
    />
  );
}

const FRAME_PIECES = ['Column', 'BasePlate', 'EaveHaunch', 'EaveHaunchHigh', 'Rafter', 'RidgeJoint', 'GirtCleat'] as const;
const PURLIN_PIECES = ['Purlin', 'PurlinCleat'] as const;
const RAINWATER_PIECES = ['Gutter', 'GutterOutlet', 'GutterEndCap', 'Downpipe', 'DownpipeShoe', 'DownpipeOutlet', 'RidgeCap'] as const;

/** Portal frames: columns on base plates, rafters, the eave and ridge joints, and the cladding cleats. */
export function Frames(props: SteelProps) {
  return <Pieces names={FRAME_PIECES} {...props} />;
}

/** Purlin lines along the hall, with a cleat on every frame. */
export function Purlins(props: SteelProps) {
  return <Pieces names={PURLIN_PIECES} {...props} />;
}

/** Gutters, downpipes and the ridge flashing: they hang on the cladding and are shown with it. */
export function Rainwater(props: SteelProps) {
  return <Pieces names={RAINWATER_PIECES} {...props} />;
}

/** Every bolt of the hall in one draw call; their positions come from the sockets of the kit's joint pieces. */
export function Bolts({ kit, placements, material }: SteelProps) {
  const matrices = useMemo(() => placeBolts(placements, kit), [placements, kit]);
  if (matrices.length === 0) return null;
  return <KitInstances name="Bolt" geometry={kit.pieces.Bolt.geometry} material={material} matrices={matrices} />;
}
