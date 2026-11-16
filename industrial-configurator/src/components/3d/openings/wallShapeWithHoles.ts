// Real holes for the procedural walls (E2). Pure functions; the only dependency is three.js maths/geometry.
//
// Integration (WS-D), per wall, wherever the wall mesh is built:
//   const wall = layout.walls[key];
//   const geometry = wallGeometryWithHoles(wall, openings.filter((o) => o.wallId === wall.id));
//   const { position, rotationY } = wallMeshTransform(wall);
//   <mesh geometry={geometry} position={position} rotation-y={rotationY} />   // dispose `geometry` on change
// The geometry is the wall slab (thickness inwards from the exterior face), already mirrored where needed,
// with a through-hole for every opening. Re-build it only when that wall's openings change.

import * as THREE from 'three';
import type { Vec3, WallDescriptor } from '@/lib/hall';
import type { Opening } from './types';

/** Holes never touch the wall outline (earcut cannot triangulate holes that share an edge with it). */
export const HOLE_INSET = 0.002;
/** Smaller holes than this are dropped. */
export const MIN_HOLE_SIZE = 0.02;

/** A hole rectangle in the wall's (h, v) frame, metres. */
export interface HoleRect {
  h0: number;
  h1: number;
  v0: number;
  v1: number;
}

type OpeningRect = Pick<Opening, 'offsetX' | 'sill' | 'width' | 'height'>;

/** Wall data the hole maths needs: the same fields as `WallDescriptor`. */
export type HoleWall = Pick<WallDescriptor, 'spanH' | 'spanV' | 'apexV'>;

function faceHeightAt(wall: HoleWall, h: number): number {
  const half = wall.spanH / 2;
  const towardsApex = 1 - Math.min(1, Math.abs(h - half) / half);
  return wall.spanV + (wall.apexV - wall.spanV) * towardsApex;
}

/** Clip one opening to the wall face (inset by HOLE_INSET); null when nothing is left. */
export function clipOpeningToWall(wall: HoleWall, o: OpeningRect): HoleRect | null {
  const h0 = Math.max(HOLE_INSET, o.offsetX);
  const h1 = Math.min(wall.spanH - HOLE_INSET, o.offsetX + o.width);
  const v0 = Math.max(HOLE_INSET, o.sill);
  // The face is concave (rises to the apex), so its lowest point over [h0, h1] is at one of the ends.
  const ceiling = Math.min(faceHeightAt(wall, h0), faceHeightAt(wall, h1)) - HOLE_INSET;
  const v1 = Math.min(o.sill + o.height, ceiling);
  if (!(h1 - h0 >= MIN_HOLE_SIZE) || !(v1 - v0 >= MIN_HOLE_SIZE)) return null;
  return { h0, h1, v0, v1 };
}

const overlaps = (a: HoleRect, b: HoleRect) => a.h0 < b.h1 && b.h0 < a.h1 && a.v0 < b.v1 && b.v0 < a.v1;

/**
 * Hole rectangles for the openings of one wall: clipped to the face, and overlapping openings (a conflict
 * that E7 flags) are merged into their bounding box so the triangulation stays valid.
 */
export function computeWallHoles(wall: HoleWall, openings: ReadonlyArray<OpeningRect>): HoleRect[] {
  let holes = openings.map((o) => clipOpeningToWall(wall, o)).filter((r): r is HoleRect => r !== null);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < holes.length; i++) {
      for (let j = i + 1; j < holes.length; j++) {
        if (!overlaps(holes[i], holes[j])) continue;
        const a = holes[i];
        const b = holes[j];
        const union: HoleRect = {
          h0: Math.min(a.h0, b.h0),
          h1: Math.max(a.h1, b.h1),
          v0: Math.min(a.v0, b.v0),
          v1: Math.max(a.v1, b.v1),
        };
        holes = holes.filter((_, k) => k !== i && k !== j).concat(union);
        merged = true;
        break outer;
      }
    }
  }
  return holes;
}

/** True when the wall's local +X (after rotating by `yaw`) runs against `axisH`, i.e. the left wall. */
export function isMirrored(wall: Pick<WallDescriptor, 'yaw' | 'axisH'>): boolean {
  const localX: Vec3 = [Math.cos(wall.yaw), 0, -Math.sin(wall.yaw)];
  return localX[0] * wall.axisH[0] + localX[2] * wall.axisH[2] < 0;
}

/**
 * The wall outline with a hole per opening, in the mesh's local frame: x along the rotated +X (h, or spanH - h on
 * a mirrored wall), y up.
 */
export function wallShapeWithHoles(
  wall: Pick<WallDescriptor, 'polygon' | 'spanH' | 'spanV' | 'apexV' | 'yaw' | 'axisH'>,
  openings: ReadonlyArray<OpeningRect>,
): THREE.Shape {
  const mirrored = isMirrored(wall);
  const x = (h: number) => (mirrored ? wall.spanH - h : h);

  const shape = new THREE.Shape(wall.polygon.map(([h, v]) => new THREE.Vector2(x(h), v)));
  for (const r of computeWallHoles(wall, openings)) {
    shape.holes.push(
      new THREE.Path([
        new THREE.Vector2(x(r.h0), r.v0),
        new THREE.Vector2(x(r.h1), r.v0),
        new THREE.Vector2(x(r.h1), r.v1),
        new THREE.Vector2(x(r.h0), r.v1),
      ]),
    );
  }
  return shape;
}

/** Position and Y rotation of the wall mesh: the mesh-local origin is the wall's bottom corner on the exterior face. */
export function wallMeshTransform(wall: WallDescriptor): { position: Vec3; rotationY: number } {
  const h = isMirrored(wall) ? wall.spanH : 0;
  const { origin, axisH } = wall;
  return {
    position: [origin[0] + h * axisH[0], origin[1] + h * axisH[1], origin[2] + h * axisH[2]],
    rotationY: wall.yaw,
  };
}

/** The wall slab with real holes: exterior face at local z = 0, extruded `thickness` inwards (-z). */
export function wallGeometryWithHoles(wall: WallDescriptor, openings: ReadonlyArray<OpeningRect>): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(wallShapeWithHoles(wall, openings), {
    depth: wall.thickness,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -wall.thickness);
  return geometry;
}
