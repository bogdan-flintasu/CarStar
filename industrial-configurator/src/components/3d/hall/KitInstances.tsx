'use client';

/**
 * Draws one geometry at many transforms in a single draw call. The only imperative code of the hall: three.js keeps
 * instance transforms in a buffer, so they are written in a layout effect whenever `matrices` changes.
 *
 * Picking contract (for "click a component for details"): every mesh drawn here is named after its kit piece
 * (`object.name`, also `userData.kitPiece`) and instance i is `matrices[i]`, in the order given. For the steel pieces
 * that order is placement order, so a raycast hit maps back as `placements[userData.kitPiece][hit.instanceId]`
 * (placements.ts; the layout element is the one that placement was made from, in the same order). Meshes with
 * `userData.pickable === false` are static fittings (bolt chunks, see qualityLod.ts) whose instances are not in placement
 * order and do not take part in raycasting.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { BufferGeometry, InstancedMesh, Material, Matrix4 } from 'three';
import { registerDetail } from './qualityDetail';

interface KitInstancesProps {
  /** Object name in the scene graph (the kit piece). */
  name: string;
  geometry: BufferGeometry;
  material: Material;
  matrices: readonly Matrix4[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** False for static fittings that are never picked: no raycasting. Default true. */
  pickable?: boolean;
  /**
   * Size (metres) of one piece for the level of detail: the mesh is drawn in the live view only when its pieces, at
   * its nearest point, would be big enough on screen (qualityDetail.ts). Omitted: always drawn.
   */
  detailSize?: number;
}

/** Buffer sizes grow in powers of two, so dragging a slider re-allocates only a few times. */
const capacityFor = (count: number) => 2 ** Math.ceil(Math.log2(Math.max(count, 1)));
const noRaycast = () => {};

export default function KitInstances({
  name,
  geometry,
  material,
  matrices,
  castShadow,
  receiveShadow,
  pickable = true,
  detailSize,
}: KitInstancesProps) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const scene = useThree((state) => state.scene);
  const capacity = capacityFor(matrices.length);

  useLayoutEffect(() => {
    const instances = mesh.current;
    if (!instances) return;
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
    instances.count = matrices.length;
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    invalidate();
  }, [matrices, capacity, geometry, material, invalidate]);

  useLayoutEffect(() => {
    const instances = mesh.current;
    if (!instances || detailSize === undefined) return;
    return registerDetail(scene, instances, detailSize);
  }, [scene, detailSize, capacity]);

  // Geometry and material are shared (dispose={null}); only this mesh's own instance buffer is released here.
  useEffect(() => {
    const instances = mesh.current;
    return () => {
      instances?.dispose();
    };
  }, [capacity]);

  return (
    <instancedMesh
      key={capacity}
      ref={mesh}
      name={name}
      userData={{ kitPiece: name, pickable }}
      {...(pickable ? {} : { raycast: noRaycast })}
      args={[geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      dispose={null}
    />
  );
}
