'use client';

/** What surrounds the hall: the terrain and the sun. */
import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { Object3D, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { HallLayout } from '@/lib/hall';

const GROUND_SIZE = 2000;
const GRASS_METRES_PER_TILE = 5;
const GRASS_MAPS = {
  map: '/grass/grass_color.webp',
  normalMap: '/grass/grass_normal.webp',
  roughnessMap: '/grass/grass_roughness.webp',
};

function tiled(source: Texture, isColor: boolean): Texture {
  const texture = source.clone();
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.setScalar(GROUND_SIZE / GRASS_METRES_PER_TILE);
  if (isColor) texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function GrassGround({ y }: { y: number }) {
  const sources = useTexture(GRASS_MAPS);
  const maps = useMemo(
    () => ({ map: tiled(sources.map, true), normalMap: tiled(sources.normalMap, false), roughnessMap: tiled(sources.roughnessMap, false) }),
    [sources],
  );
  useEffect(() => () => Object.values(maps).forEach((texture) => texture.dispose()), [maps]);

  return (
    <mesh name="Ground" rotation-x={-Math.PI / 2} position-y={y} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial {...maps} />
    </mesh>
  );
}

function PlainGround({ y }: { y: number }) {
  return (
    <mesh name="Ground" rotation-x={-Math.PI / 2} position-y={y} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial color="#3a5a2a" roughness={1} metalness={0} />
    </mesh>
  );
}

/** The terrain, just under the layout's ground level. `textured` = grass maps (off on phones). */
export function Ground({ layout, textured }: { layout: HallLayout; textured: boolean }) {
  const y = layout.groundY - 0.01;
  return textured ? <GrassGround y={y} /> : <PlainGround y={y} />;
}

/** Unit vector towards the sun. */
const SUN_DIRECTION = [0.408, 0.816, 0.408] as const;

interface SunProps {
  layout: HallLayout;
  intensity: number;
  shadowMapSize: number;
}

/**
 * The sun, with its shadow camera fitted to the hall: the frustum is a box around the building's bounding sphere,
 * long enough for the shadow to reach the ground, so the shadow map's resolution is spent on the hall whatever its size.
 */
export function Sun({ layout, intensity, shadowMapSize }: SunProps) {
  const target = useMemo(() => new Object3D(), []);
  const { min, max } = layout.bounds;
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] as const;
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  const distance = radius + 10;
  const shadowReach = (max[1] - layout.groundY) / SUN_DIRECTION[1];
  const position = centre.map((value, axis) => value + SUN_DIRECTION[axis] * distance) as [number, number, number];

  return (
    <>
      <directionalLight
        position={position}
        target={target}
        intensity={intensity}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      >
        <orthographicCamera attach="shadow-camera" args={[-radius, radius, radius, -radius, 1, distance + radius + shadowReach]} />
      </directionalLight>
      <primitive object={target} position={centre} />
    </>
  );
}
