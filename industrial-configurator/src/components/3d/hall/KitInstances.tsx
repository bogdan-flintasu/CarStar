'use client';

/**
 * Draws one geometry at many transforms in a single draw call. The only imperative code of the hall: three.js keeps
 * instance transforms in a buffer, so they are written in a layout effect whenever `matrices` changes.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { BufferGeometry, InstancedMesh, Material, Matrix4 } from 'three';

interface KitInstancesProps {
  geometry: BufferGeometry;
  material: Material;
  matrices: readonly Matrix4[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Buffer sizes grow in powers of two, so dragging a slider re-allocates only a few times. */
const capacityFor = (count: number) => 2 ** Math.ceil(Math.log2(Math.max(count, 1)));

export default function KitInstances({ geometry, material, matrices, castShadow, receiveShadow }: KitInstancesProps) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const capacity = capacityFor(matrices.length);

  useLayoutEffect(() => {
    const instances = mesh.current;
    if (!instances) return;
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
    instances.count = matrices.length;
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    invalidate();
  }, [matrices, capacity, invalidate]);

  // Geometry and material are shared (dispose={null}); only this mesh's own instance buffer is released here.
  useEffect(() => {
    const instances = mesh.current;
    return () => instances?.dispose();
  }, [capacity]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      dispose={null}
    />
  );
}
