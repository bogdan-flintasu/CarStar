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
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Matrix4, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three';

const KIT_URL = '/models/hall-kit.glb';

export const KIT_PIECES = [
  'Column',
  'BasePlate',
  'EaveHaunch',
  'Rafter',
  'RidgeJoint',
  'Purlin',
  'PurlinCleat',
  'GirtCleat',
  'Gutter',
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

/** Suspends until the kit is loaded. The geometries belong to drei's loader cache: do not dispose them. */
export function useHallKit(detail: KitDetail = 'full'): HallKit {
  const { nodes, materials } = useGLTF(KIT_URL, false, true);
  return useMemo(() => {
    const pieces = Object.fromEntries(KIT_PIECES.map((name) => [name, readPiece(nodes, name, detail)]));
    return { pieces, materials } as unknown as HallKit;
  }, [nodes, materials, detail]);
}

useGLTF.preload(KIT_URL, false, true);
