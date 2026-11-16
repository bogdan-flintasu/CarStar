'use client';

/**
 * The roof: both slopes as one panel, as thick as the cladding, with plumb eave edges.
 * Its cross-section (the layout's two roof planes) is extruded along the hall, so the ridge is closed by construction.
 */
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape, Vector2, type BufferGeometry, type Material } from 'three';
import type { HallLayout, HallSlab, RoofPlane } from '@/lib/hall';

function roofGeometry({ left, right }: Record<'left' | 'right', RoofPlane>): BufferGeometry {
  const up = left.plumbThickness;
  const section = [
    left.eave,
    left.ridge,
    right.eave,
    [right.eave[0], right.eave[1] + up],
    [left.ridge[0], left.ridge[1] + up],
    [left.eave[0], left.eave[1] + up],
  ];
  const shape = new Shape(section.map(([x, y]) => new Vector2(x, y)));
  return new ExtrudeGeometry(shape, { depth: left.zFront - left.zBack, bevelEnabled: false }).translate(0, 0, left.zBack);
}

export function Roof({ layout, material }: { layout: HallLayout; material: Material }) {
  const geometry = useMemo(() => roofGeometry(layout.roof), [layout.roof]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name="Roof" geometry={geometry} material={material} castShadow receiveShadow dispose={null} />;
}

/** A flat slab seen from above: `w` across (X), `l` along (Z), its top face at y = 0. UVs are in metres. */
function slabGeometry({ w, l, thickness }: HallSlab): BufferGeometry {
  const plan = new Shape([new Vector2(-w / 2, -l / 2), new Vector2(w / 2, -l / 2), new Vector2(w / 2, l / 2), new Vector2(-w / 2, l / 2)]);
  return new ExtrudeGeometry(plan, { depth: thickness, bevelEnabled: false }).rotateX(Math.PI / 2);
}

/** The concrete floor slab with its apron. It only receives shadows. */
export function Slab({ slab, material }: { slab: HallSlab; material: Material }) {
  const geometry = useMemo(() => slabGeometry(slab), [slab]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      name="Slab"
      geometry={geometry}
      material={material}
      position={[slab.centerX, slab.topY, slab.centerZ]}
      receiveShadow
      dispose={null}
    />
  );
}
