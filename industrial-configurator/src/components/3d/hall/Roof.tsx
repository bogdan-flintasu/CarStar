'use client';

/**
 * The roof: its slopes as one panel, as thick as the cladding, with plumb eave edges.
 * Its cross-section (the layout's roof planes: two for a gable, one for a mono-pitch roof) is extruded along the hall,
 * so the ridge is closed by construction.
 * The two gable ends of the extrusion are the verge flashings (trim colour); its long faces are the cladding.
 */
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape, Vector2, type BufferGeometry, type Material } from 'three';
import type { HallLayout, HallSlab, RoofPlane } from '@/lib/hall';

/** The roof's cross-section (underside, then top surface back), extruded along the hall. */
function roofGeometry(planes: readonly RoofPlane[]): BufferGeometry {
  const first = planes[0];
  const up = first.plumbThickness;
  // Gable: left eave, ridge, right eave. Mono: low eave, high edge.
  const underside = planes.length === 1 ? [first.eave, first.ridge] : [planes[0].eave, planes[0].ridge, planes[1].eave];
  const section = [...underside, ...[...underside].reverse().map(([x, y]) => [x, y + up] as const)];
  const shape = new Shape(section.map(([x, y]) => new Vector2(x, y)));
  return new ExtrudeGeometry(shape, { depth: first.zFront - first.zBack, bevelEnabled: false }).translate(0, 0, first.zBack);
}

export function Roof({ layout, material, edgeMaterial }: { layout: HallLayout; material: Material; edgeMaterial: Material }) {
  const geometry = useMemo(() => roofGeometry(layout.roof), [layout.roof]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // ExtrudeGeometry groups: 0 = the end caps (the section), 1 = the extruded faces.
  const materials = useMemo(() => [edgeMaterial, material], [edgeMaterial, material]);
  return <mesh name="Roof" geometry={geometry} material={materials} castShadow receiveShadow dispose={null} />;
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
