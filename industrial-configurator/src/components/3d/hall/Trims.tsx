'use client';

/**
 * Corner flashings: an L-shaped trim up each outer corner of the hall, over the joint between the gable and the side
 * wall. They cover the cut edges of the wall panels, as on a real hall, and take the trim colour.
 */
import type { Material } from 'three';
import type { HallLayout } from '@/lib/hall';

/** Sheet thickness of the flashing; it sits on the cladding's outer face. */
const TRIM_THICKNESS = 0.006;
/** Width of each leg on the wall face, beyond the panel edge it covers. */
const LEG_CLEAR = 0.07;

export default function Trims({ layout, material }: { layout: HallLayout; material: Material }) {
  const { front, back } = layout.walls;
  const outer = layout.halfWidths.wallOuter;
  const height = front.spanV;
  const leg = layout.panelThickness + LEG_CLEAR;
  const t = TRIM_THICKNESS;

  const corners = [-1, 1].flatMap((sx) =>
    [
      { z: front.origin[2], sz: 1 },
      { z: back.origin[2], sz: -1 },
    ].map(({ z, sz }) => ({ key: `${sx}${sz}`, sx, sz, x: sx * outer, z })),
  );

  return (
    <group name="CornerTrims">
      {corners.map(({ key, sx, sz, x, z }) => (
        <group key={key}>
          {/* Leg on the gable face. */}
          <mesh
            material={material}
            position={[x - sx * (leg / 2 - t / 2), height / 2, z + sz * (t / 2)]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[leg + t, height, t]} />
          </mesh>
          {/* Leg on the side wall face. */}
          <mesh
            material={material}
            position={[x + sx * (t / 2), height / 2, z - sz * (leg / 2 - t / 2)]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[t, height, leg + t]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
