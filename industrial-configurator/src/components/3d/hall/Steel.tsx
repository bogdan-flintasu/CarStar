'use client';

/**
 * The steelwork, grouped the way a hall is built: frames, purlins, bolts, rainwater goods.
 * Each kit piece is one instanced draw call, whatever the size of the hall, with its instances in placement order
 * (`placements[name][i]` is instance i: the picking contract of KitInstances.tsx). Only the bolts are chunked.
 */
import { useMemo } from 'react';
import type { Material } from 'three';
import KitInstances from './KitInstances';
import type { HallKit, KitPieceName } from './kit';
import { placeBolts, type KitPlacements } from './placements';
import { BOLT_DETAIL_SIZE_M, chunkAlongZ } from './qualityLod';

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
export const RAINWATER_PIECES = ['Gutter', 'GutterOutlet', 'GutterEndCap', 'Downpipe', 'DownpipeShoe', 'DownpipeOutlet', 'RidgeCap'] as const;
/** T3d layers: the rainwater goods proper ("Apă pluvială"), and the ridge flashing, which goes with the roof. */
export const GUTTER_PIECES = RAINWATER_PIECES.filter((name) => name !== 'RidgeCap');
export const ROOF_FLASHING_PIECES = ['RidgeCap'] as const;

/** Portal frames: columns on base plates, rafters, the eave and ridge joints, and the cladding cleats. */
export function Frames(props: SteelProps) {
  return <Pieces names={FRAME_PIECES} {...props} />;
}

/** Purlin lines along the hall, with a cleat on every frame. */
export function Purlins(props: SteelProps) {
  return <Pieces names={PURLIN_PIECES} {...props} />;
}

/** Gutters, downpipes and the ridge flashing: they hang on the cladding and are shown with it. */
export function Rainwater({ pieces = RAINWATER_PIECES, ...props }: SteelProps & { pieces?: readonly KitPieceName[] }) {
  return <Pieces names={pieces} {...props} />;
}

/**
 * Every bolt of the hall; their positions come from the sockets of the kit's joint pieces. Split into chunks along the
 * hall (one draw call each), drawn only where the bolts are big enough on screen (qualityLod.ts). Not pickable.
 */
export function Bolts({ kit, placements, material }: SteelProps) {
  const chunks = useMemo(() => chunkAlongZ(placeBolts(placements, kit)), [placements, kit]);
  if (chunks.length === 0) return null;
  return (
    <group name="Bolts">
      {chunks.map((matrices, index) => (
        <KitInstances
          key={index}
          name="Bolt"
          geometry={kit.pieces.Bolt.geometry}
          material={material}
          matrices={matrices}
          pickable={false}
          detailSize={BOLT_DETAIL_SIZE_M}
        />
      ))}
    </group>
  );
}
