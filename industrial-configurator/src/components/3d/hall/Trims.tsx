'use client';

/**
 * Flashings, in the trim colour:
 *   - an L-shaped trim up each outer corner of the hall, over the joint between the end wall and the side wall: it
 *     covers the cut edges of the wall panels, as on a real hall;
 *   - along every gutter eave, an L that caps the roof panel's end, flush with the wall face; it stops at the panel's
 *     underside, above the gutter, so nothing reaches into the gutter;
 *   - on a mono-pitch roof, an L along the high edge that caps the roof panel's end and laps over the wall top
 *     (the gable's ridge cap does this job on a gable roof).
 */
import type { Material } from 'three';
import type { HallLayout, RoofPlane, Vec2 } from '@/lib/hall';

/** Sheet thickness of a flashing; it sits on the cladding's outer face. */
const TRIM_THICKNESS = 0.006;
/** Width of each corner leg on the wall face, beyond the panel edge it covers. */
const LEG_CLEAR = 0.07;
/** Roof-edge flashings: how far the cap laps in over the roof's top. */
const EDGE_LAP = 0.12;
/** High-edge flashing: how far it reaches down past the roof's underside, over the top of the wall. */
const HIGH_EDGE_DROP = 0.15;

function Plate({ material, position, size }: { material: Material; position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh material={material} position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

interface EdgeFlashingProps {
  name: string;
  layout: HallLayout;
  plane: RoofPlane;
  /** The roof edge it caps: the panel's underside there. */
  edge: Vec2;
  /** +1 where the roof rises from the edge into the hall (an eave), -1 where it falls (a mono roof's high edge). */
  rise: 1 | -1;
  /** Where the face, flat on the panel's end, stops. */
  bottomY: number;
  material: Material;
}

/** An L of sheet steel along a roof edge: a cap lapping in over the roof's top and a face flat on the panel's end. */
function EdgeFlashing({ name, layout, plane, edge: [edgeX, undersideY], rise, bottomY, material }: EdgeFlashingProps) {
  const out = Math.sign(edgeX);
  const t = TRIM_THICKNESS;
  const slope = Math.tan(layout.pitch);
  const topY = undersideY + plane.plumbThickness;
  const length = plane.zFront - plane.zBack + 2 * t;
  const z = (plane.zFront + plane.zBack) / 2;
  const faceX = edgeX + out * (t / 2);
  const faceTop = topY + t;
  // The cap runs from the face's outer side in over the roof, sitting on its top surface.
  const capCentre = (EDGE_LAP - t) / 2; // inwards from the edge
  return (
    <group name={name}>
      <Plate material={material} position={[faceX, (faceTop + bottomY) / 2, z]} size={[t, faceTop - bottomY, length]} />
      <mesh
        material={material}
        position={[edgeX - out * capCentre, topY + rise * capCentre * slope + t / 2, z]}
        rotation={[0, 0, -out * rise * layout.pitch]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[(EDGE_LAP + t) / Math.cos(layout.pitch), t, length]} />
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
      {layout.roofType === 'mono' && (
        <EdgeFlashing
          name="HighEdgeFlashing"
          layout={layout}
          plane={layout.roof[0]}
          edge={layout.roof[0].ridge}
          rise={-1}
          bottomY={layout.roof[0].ridge[1] - HIGH_EDGE_DROP}
          material={material}
        />
      )}
      {layout.gutters.map((gutter) => {
        const plane = layout.roof.find((p) => p.side === gutter.side) ?? layout.roof[0];
        return (
          <EdgeFlashing
            key={gutter.side}
            name="EaveFlashing"
            layout={layout}
            plane={plane}
            edge={plane.eave}
            rise={1}
            bottomY={plane.eave[1]}
            material={material}
          />
        );
      })}
    </group>
  );
}
