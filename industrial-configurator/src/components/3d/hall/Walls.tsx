'use client';

/**
 * The four walls: flat panels as thick as the cladding, cut to the layout's wall outlines (the gables follow the
 * roof), with a real hole for every opening. Geometry and holes come from the openings module (WS-E).
 */
import { useEffect, useMemo } from 'react';
import type { Material } from 'three';
import type { HallLayout, LegacyWallId, WallDescriptor } from '@/lib/hall';
import { wallGeometryWithHoles, wallMeshTransform } from '@/components/3d/openings/wallShapeWithHoles';

/** A rectangular opening, in metres on its wall's face: `offsetX` from the wall's start, `sill` above the floor. */
export interface WallHole {
  wallId: LegacyWallId;
  offsetX: number;
  sill: number;
  width: number;
  height: number;
}

interface WallsProps {
  layout: HallLayout;
  /** The cladding faces. */
  material: Material;
  /** The panel's cut edges: corners and opening reveals. */
  edgeMaterial: Material;
  holes?: readonly WallHole[];
  /** Pointer entered (wall id) or left (null) a wall; used to pick the wall an opening is placed on. */
  onHover?: (wallId: LegacyWallId | null) => void;
}

const NO_HOLES: readonly WallHole[] = [];

function Wall({ wall, material, edgeMaterial, holes = NO_HOLES, onHover }: { wall: WallDescriptor } & Omit<WallsProps, 'layout'>) {
  // Keyed by value, so moving an opening rebuilds only the wall it is on.
  const ownHoles = JSON.stringify(holes.filter((hole) => hole.wallId === wall.id));
  const geometry = useMemo(() => wallGeometryWithHoles(wall, JSON.parse(ownHoles) as WallHole[]), [wall, ownHoles]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // ExtrudeGeometry groups: 0 = the two faces (profiled cladding), 1 = the cut edges (plain).
  const materials = useMemo(() => [material, edgeMaterial], [material, edgeMaterial]);

  return (
    <mesh
      name={wall.id}
      geometry={geometry}
      material={materials}
      position={wallMeshTransform(wall).position}
      rotation-y={wall.yaw}
      castShadow
      receiveShadow
      dispose={null}
      onPointerOver={onHover && ((event) => (event.stopPropagation(), onHover(wall.id)))}
      onPointerOut={onHover && (() => onHover(null))}
    />
  );
}

export default function Walls({ layout, material, edgeMaterial, holes, onHover }: WallsProps) {
  return Object.values(layout.walls).map((wall) => (
    <Wall key={wall.key} wall={wall} material={material} edgeMaterial={edgeMaterial} holes={holes} onHover={onHover} />
  ));
}
