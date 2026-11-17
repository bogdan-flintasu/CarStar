'use client';

/**
 * Flashings, in the trim colour:
 *   - an L-shaped trim up each outer corner of the hall, over the joint between the end wall and the side wall: it
 *     covers the cut edges of the wall panels, as on a real hall;
 *   - on a mono-pitch roof, an L along the high edge that caps the roof panel's end and laps over the wall top
 *     (the gable's ridge cap does this job on a gable roof).
 */
import type { Material } from 'three';
import type { HallLayout } from '@/lib/hall';

/** Sheet thickness of a flashing; it sits on the cladding's outer face. */
const TRIM_THICKNESS = 0.006;
/** Width of each corner leg on the wall face, beyond the panel edge it covers. */
const LEG_CLEAR = 0.07;
/** High-edge flashing: how far it reaches down past the roof's underside, and in over the roof's top. */
const HIGH_EDGE_DROP = 0.15;
const HIGH_EDGE_LAP = 0.12;

function Plate({ material, position, size }: { material: Material; position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh material={material} position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function HighEdgeFlashing({ layout, material }: { layout: HallLayout; material: Material }) {
  const plane = layout.roof[0];
  const [edgeX, undersideY] = plane.ridge;
  const out = Math.sign(edgeX);
  const t = TRIM_THICKNESS;
  const topY = undersideY + plane.plumbThickness;
  const length = plane.zFront - plane.zBack + 2 * t;
  const z = (plane.zFront + plane.zBack) / 2;
  const height = plane.plumbThickness + HIGH_EDGE_DROP + t;
  return (
    <group name="HighEdgeFlashing">
      {/* Face: down the roof's end and past the top of the wall. */}
      <Plate
        material={material}
        position={[edgeX + out * (t / 2), topY + t - height / 2, z]}
        size={[t, height, length]}
      />
      {/* Cap: in over the top of the roof, following the slope. */}
      <mesh
        material={material}
        position={[edgeX - out * (HIGH_EDGE_LAP / 2 - t / 2), topY + t / 2 - (HIGH_EDGE_LAP / 2) * Math.tan(layout.pitch), z]}
        rotation={[0, 0, out * layout.pitch]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[HIGH_EDGE_LAP + t, t, length]} />
      </mesh>
    </group>
  );
}

export default function Trims({ layout, material }: { layout: HallLayout; material: Material }) {
  const { front, back, left, right } = layout.walls;
  const outer = layout.halfWidths.wallOuter;
  const leg = layout.panelThickness + LEG_CLEAR;
  const t = TRIM_THICKNESS;

  // Each corner is as high as the side wall it belongs to.
  const corners = [
    { sx: -1, height: left.spanV },
    { sx: 1, height: right.spanV },
  ].flatMap(({ sx, height }) =>
    [
      { z: front.origin[2], sz: 1 },
      { z: back.origin[2], sz: -1 },
    ].map(({ z, sz }) => ({ key: `${sx}${sz}`, sx, sz, x: sx * outer, z, height })),
  );

  return (
    <group name="Trims">
      {corners.map(({ key, sx, sz, x, z, height }) => (
        <group key={key}>
          {/* Leg on the end wall face. */}
          <Plate material={material} position={[x - sx * (leg / 2 - t / 2), height / 2, z + sz * (t / 2)]} size={[leg + t, height, t]} />
          {/* Leg on the side wall face. */}
          <Plate material={material} position={[x + sx * (t / 2), height / 2, z - sz * (leg / 2 - t / 2)]} size={[t, height, leg + t]} />
        </group>
      ))}
      {layout.roofType === 'mono' && <HighEdgeFlashing layout={layout} material={material} />}
    </group>
  );
}
