import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeHallLayout } from '@/lib/hall';
import type { WallDescriptor } from '@/lib/hall';
import {
  HOLE_INSET,
  clipOpeningToWall,
  computeWallHoles,
  isMirrored,
  wallGeometryWithHoles,
  wallMeshTransform,
  wallShapeWithHoles,
} from './wallShapeWithHoles';

const layout = computeHallLayout({ width: 12, height: 4, length: 12, foundation: true, panels: false, insulationMm: 30 });
const { front, left, right } = layout.walls;

const op = (offsetX: number, sill: number, width: number, height: number) => ({ offsetX, sill, width, height });

/** Surface area of a triangle mesh in the XY plane (front faces only: z = 0 cap). */
function frontFaceArea(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let area = 0;
  const tri = (i: number, j: number, k: number) => {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, j);
    c.fromBufferAttribute(pos, k);
    if (Math.abs(a.z) > 1e-6 || Math.abs(b.z) > 1e-6 || Math.abs(c.z) > 1e-6) return;
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    area += n.length() / 2;
  };
  if (index) for (let i = 0; i < index.count; i += 3) tri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  else for (let i = 0; i < pos.count; i += 3) tri(i, i + 1, i + 2);
  return area;
}

describe('clipOpeningToWall', () => {
  const rect = { spanH: 10, spanV: 3, apexV: 3 };
  const gable = { spanH: 10, spanV: 3, apexV: 4 };
  const cases: Array<[string, typeof rect, ReturnType<typeof op>, ReturnType<typeof clipOpeningToWall>]> = [
    ['inside', rect, op(2, 1, 1, 1), { h0: 2, h1: 3, v0: 1, v1: 2 }],
    ['door on the floor stays off the outline', rect, op(2, 0, 1, 2), { h0: 2, h1: 3, v0: HOLE_INSET, v1: 2 }],
    ['clipped at the left edge', rect, op(-1, 1, 3, 1), { h0: HOLE_INSET, h1: 2, v0: 1, v1: 2 }],
    ['clipped at the right edge', rect, op(9, 1, 3, 1), { h0: 9, h1: 10 - HOLE_INSET, v0: 1, v1: 2 }],
    ['clipped at the top', rect, op(2, 2, 1, 5), { h0: 2, h1: 3, v0: 2, v1: 3 - HOLE_INSET }],
    ['outside the wall is dropped', rect, op(11, 1, 1, 1), null],
    ['sliver is dropped', rect, op(2, 1, 0.01, 1), null],
    ['gable: tall opening in the middle is kept', gable, op(4.5, 1, 1, 2.9), { h0: 4.5, h1: 5.5, v0: 1, v1: 3.9 - HOLE_INSET }],
    ['gable: the same opening near the edge is cut by the slope', gable, op(0.5, 1, 1, 2.9), { h0: 0.5, h1: 1.5, v0: 1, v1: 3.1 - HOLE_INSET }],
  ];
  it.each(cases)('%s', (_name, wall, o, expected) => {
    const got = clipOpeningToWall(wall, o);
    if (expected === null) return expect(got).toBeNull();
    expect(got).not.toBeNull();
    for (const k of ['h0', 'h1', 'v0', 'v1'] as const) expect(got![k]).toBeCloseTo(expected[k], 9);
  });
});

describe('computeWallHoles', () => {
  const wall = { spanH: 12, spanV: 3, apexV: 3 };
  it('keeps separate openings separate', () => {
    expect(computeWallHoles(wall, [op(1, 1, 1, 1), op(5, 1, 1, 1)])).toHaveLength(2);
  });
  it('merges overlapping openings into their bounding box', () => {
    const holes = computeWallHoles(wall, [op(1, 1, 2, 1), op(2, 1.5, 2, 1)]);
    expect(holes).toEqual([{ h0: 1, h1: 4, v0: 1, v1: 2.5 }]);
  });
  it('merges chains of overlaps', () => {
    expect(computeWallHoles(wall, [op(1, 1, 2, 1), op(2.5, 1, 2, 1), op(4, 1, 2, 1)])).toHaveLength(1);
  });
  it('openings that only touch stay separate', () => {
    expect(computeWallHoles(wall, [op(1, 1, 1, 1), op(2, 1, 1, 1)])).toHaveLength(2);
  });
});

describe('wallShapeWithHoles / wallGeometryWithHoles on real walls', () => {
  it('front gable: area equals the face minus the holes', () => {
    const openings = [op(1, 1, 1.5, 1), op(5, 0, 3, 3), op(5, 3.5, 1, 0.5)];
    const geo = wallGeometryWithHoles(front, openings);
    const holes = computeWallHoles(front, openings);
    const holeArea = holes.reduce((s, r) => s + (r.h1 - r.h0) * (r.v1 - r.v0), 0);
    expect(holes).toHaveLength(3);
    expect(frontFaceArea(geo)).toBeCloseTo(front.area - holeArea, 6);
  });

  it('no openings: the geometry is the plain face', () => {
    expect(frontFaceArea(wallGeometryWithHoles(front, []))).toBeCloseTo(front.area, 6);
  });

  it.each([
    ['left', left],
    ['right', right],
  ] as const)('%s side wall: holes are inside the face and extrude inwards', (_k, wall: WallDescriptor) => {
    const geo = wallGeometryWithHoles(wall, [op(2, 1, 1, 1), op(5, 0, 1, 2.1)]);
    geo.computeBoundingBox();
    expect(geo.boundingBox!.min.z).toBeCloseTo(-wall.thickness, 6);
    expect(geo.boundingBox!.max.z).toBeCloseTo(0, 6);
    expect(frontFaceArea(geo)).toBeLessThan(wall.area);
  });

  it('mirroring: only the left wall is mirrored, and its mesh origin is the far corner', () => {
    expect(isMirrored(left)).toBe(true);
    expect(isMirrored(right)).toBe(false);
    expect(isMirrored(front)).toBe(false);
    expect(isMirrored(layout.walls.back)).toBe(false);
    const t = wallMeshTransform(left);
    expect(t.position[2]).toBeCloseTo(left.origin[2] - left.spanH, 9);
    expect(t.rotationY).toBe(left.yaw);
  });

  it('a hole lands at the right world position on every wall', () => {
    // Opening 1 m wide at offsetX 2, sill 1: its centre in world space must be where wallPointToWorld says.
    for (const wall of Object.values(layout.walls)) {
      const shape = wallShapeWithHoles(wall, [op(2, 1, 1, 1)]);
      const pts = shape.holes[0].getPoints();
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const t = wallMeshTransform(wall);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(...t.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rotationY, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      const world = new THREE.Vector3(cx, cy, 0).applyMatrix4(m);
      const expected = new THREE.Vector3(
        wall.origin[0] + 2.5 * wall.axisH[0],
        1.5,
        wall.origin[2] + 2.5 * wall.axisH[2],
      );
      expect(world.distanceTo(expected), wall.key).toBeLessThan(0.01);
    }
  });
});
