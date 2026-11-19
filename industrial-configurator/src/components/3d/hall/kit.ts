'use client';

/**
 * The hall kit: one geometry per steel piece, plus the bolt sockets of every joint piece.
 *
 * THE ONLY module that knows the asset file. Names, anchors and axes are fixed by public/models/ASSET_CONTRACT.md:
 *   - every piece sits at its anchor (local origin) and is authored for the LEFT (-X) side of the hall;
 *     the right-hand copy is the same piece turned 180 degrees about Y (see placements.ts);
 *   - stretch pieces are exactly 1 m long on their stretch axis and are scaled along it;
 *   - `sockets` are the local transforms of the bolts a joint piece carries.
 */
import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Matrix4, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three';
import { GUTTER_OUTLET_HOLE_RADIUS, GUTTER_OUTLET_LENGTH, ROOF_PITCH_DEG } from '@/lib/hall';
import { deriveGutterOutlet, deriveHighEaveJoint } from './kitGeometry';

const KIT_URL = '/models/hall-kit.glb';

export const KIT_PIECES = [
  'Column',
  'BasePlate',
  'EaveHaunch',
  'EaveHaunchHigh',
  'Rafter',
  'RidgeJoint',
  'Purlin',
  'PurlinCleat',
  'GirtCleat',
  'Gutter',
  'GutterOutlet',
  'GutterEndCap',
  'Downpipe',
  'DownpipeShoe',
  'DownpipeOutlet',
  'RidgeCap',
  'Bolt',
] as const;

export type KitPieceName = (typeof KIT_PIECES)[number];

/** `full`: every detail and all bolts. `light`: the kit's `_LOD1` meshes and no bolts (weak GPUs, backdrops). */
export type KitDetail = 'full' | 'light';

/** Side of the piece, along its local Z, that a bolt fastens: only `PurlinCleat` sockets are one-sided. */
export type SocketSide = '+Z' | '-Z';

export interface BoltSocket {
  matrix: Matrix4;
  side?: SocketSide;
}

export interface KitPiece {
  geometry: BufferGeometry;
  sockets: readonly BoltSocket[];
}

export interface HallKit {
  pieces: Readonly<Record<KitPieceName, KitPiece>>;
  /** The asset's own materials, without textures; materials.ts turns them into the scene's materials. */
  materials: Readonly<Record<'Steel' | 'Panel' | 'Concrete', Material>>;
}

const isSocket = (node: Object3D) => node.userData.kit_socket === 'Bolt';

function readSocket(node: Object3D): BoltSocket {
  const side = node.userData.side as SocketSide | undefined;
  return { matrix: new Matrix4().compose(node.position, node.quaternion, node.scale), side };
}

function readPiece(nodes: Record<string, Object3D>, name: KitPieceName, detail: KitDetail): KitPiece {
  const full = nodes[name] as Mesh | undefined;
  const light = nodes[`${name}_LOD1`] as Mesh | undefined;
  if (!full?.geometry) throw new Error(`${KIT_URL} has no mesh "${name}" (see ASSET_CONTRACT.md)`);
  if (detail === 'light') return { geometry: (light ?? full).geometry, sockets: [] };
  return { geometry: full.geometry, sockets: full.children.filter(isSocket).map(readSocket) };
}

/**
 * The rafter's plumb end cuts are baked into its 1 m geometry for the source rafter (|A - E| = 6.0877 m at 10 degrees):
 * the top of each cut sits `RAFTER_CUT_SLOPE` x height further along than its bottom. Stretched to another length the
 * cuts would lean (a wedge opens at the top of each joint), so placements.ts shears every rafter back to plumb.
 */
export const RAFTER_CUT_SLOPE = Math.tan((ROOF_PITCH_DEG * Math.PI) / 180) / 6.0877;
/**
 * Where the rafter's bottom flange ends, in its 1 m geometry. Short of 1 by the apex plates' thickness: a gable's
 * rafters stop there; a mono-pitch rafter runs on to the high column's inner face.
 */
export const RAFTER_END = 0.9983;

/** Pieces not in the asset: built here from another one (kitGeometry.ts). Bolt sockets are the source's. */
const DERIVED: Partial<Record<KitPieceName, { from: KitPieceName; derive: (geometry: BufferGeometry) => BufferGeometry }>> = {
  EaveHaunchHigh: { from: 'EaveHaunch', derive: (geometry) => deriveHighEaveJoint(geometry, (ROOF_PITCH_DEG * Math.PI) / 180) },
  // Over each downpipe: a short gutter with a hole in its floor for the downpipe's outlet.
  GutterOutlet: { from: 'Gutter', derive: (geometry) => deriveGutterOutlet(geometry, GUTTER_OUTLET_LENGTH, GUTTER_OUTLET_HOLE_RADIUS) },
};

/**
 * Suspends until the kit is loaded. The asset's geometries belong to drei's loader cache: do not dispose them.
 * (Derived geometries are small and live as long as the kit.)
 */
export function useHallKit(detail: KitDetail = 'full'): HallKit {
  const { nodes, materials } = useGLTF(KIT_URL, false, true);
  const kit = useMemo(() => {
    const pieces = Object.fromEntries(
      KIT_PIECES.filter((name) => !DERIVED[name]).map((name) => [name, readPiece(nodes, name, detail)]),
    ) as Record<KitPieceName, KitPiece>;
    for (const [name, derived] of Object.entries(DERIVED) as [KitPieceName, NonNullable<(typeof DERIVED)[KitPieceName]>][]) {
      pieces[name] = { geometry: derived.derive(pieces[derived.from].geometry), sockets: pieces[derived.from].sockets };
    }
    return { pieces, materials } as unknown as HallKit;
  }, [nodes, materials, detail]);
  // The derived geometries are this hook's own (the asset's belong to drei's cache).
  useEffect(
    () => () => (Object.keys(DERIVED) as KitPieceName[]).forEach((name) => kit.pieces[name].geometry.dispose()),
    [kit],
  );
  return kit;
}

useGLTF.preload(KIT_URL, false, true);
