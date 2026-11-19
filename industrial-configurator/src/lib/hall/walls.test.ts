import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import { COLUMN_DEPTH, END_WALL_GIRT_DEPTH, FRAME_FLANGE_WIDTH } from './constants';
import type { HallParams, Vec3, WallKey } from './types';
import { polygonArea, wallHeightAt, wallPointToWorld } from './walls';

const base: HallParams = { length: 30, width: 13.5, height: 4.5, foundation: true, panels: true, insulationMm: 80 };
const layoutOf = (overrides: Partial<HallParams> = {}) => computeHallLayout({ ...base, ...overrides });
const WALLS: WallKey[] = ['front', 'back', 'left', 'right'];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const expectPoint = (actual: Vec3, expected: Vec3) =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9));

describe('wall descriptors', () => {
  const layout = layoutOf();
  const { wallOuter, columnAxis } = layout.halfWidths;

  it.each(WALLS)('%s wall has an orthonormal frame with a horizontal outward normal', (key) => {
    const wall = layout.walls[key];
    for (const axis of [wall.axisH, wall.axisV, wall.normal]) expect(dot(axis, axis)).toBeCloseTo(1, 12);
    expect(dot(wall.axisH, wall.axisV)).toBe(0);
    expect(dot(wall.axisH, wall.normal)).toBe(0);
    expect(wall.axisV).toEqual([0, 1, 0]);
    // Outward: the normal points away from the hall's centre line.
    const faceCentre = wallPointToWorld(wall, wall.spanH / 2, 0);
    expect(dot(wall.normal, [faceCentre[0], 0, faceCentre[2] + base.length / 2])).toBeGreaterThan(0);
  });

  it.each(WALLS)('%s wall: yaw turns +Z into the normal', (key) => {
    const wall = layout.walls[key];
    expectPoint([Math.sin(wall.yaw), 0, Math.cos(wall.yaw)], wall.normal);
  });

  it('is right-handed (axisH x axisV = normal) on front, back and right; mirrored on the left', () => {
    for (const key of ['front', 'back', 'right'] as const) {
      expectPoint(cross(layout.walls[key].axisH, layout.walls[key].axisV), layout.walls[key].normal);
    }
    const left = layout.walls.left;
    expectPoint(cross(left.axisH, left.axisV), [-left.normal[0], -left.normal[1], -left.normal[2]]);
  });

  it('keeps the ids the openings store uses', () => {
    expect(WALLS.map((key) => layout.walls[key].id)).toEqual(['PereteFata', 'PereteSpate', 'PereteSTG', 'PereteDR']);
    expect(WALLS.map((key) => layout.walls[key].key)).toEqual(WALLS);
  });

  it('places the faces on the outside of the cladding', () => {
    // The end walls stand on their girts, END_WALL_GIRT_DEPTH out from the end frames' flanges.
    const frontInner = FRAME_FLANGE_WIDTH / 2 + END_WALL_GIRT_DEPTH;
    expectPoint(layout.walls.front.origin, [-wallOuter, 0, frontInner + 0.08]);
    expectPoint(layout.walls.back.origin, [wallOuter, 0, -base.length - frontInner - 0.08]);
    expectPoint(layout.walls.left.origin, [-wallOuter, 0, frontInner]);
    expectPoint(layout.walls.right.origin, [wallOuter, 0, frontInner]);
  });

  it('closes the four corners: side walls end on the inner faces of the gables', () => {
    const { front, back, left, right } = layout.walls;
    expectPoint(wallPointToWorld(front, front.spanH, 0), [wallOuter, 0, front.origin[2]]);
    expectPoint(wallPointToWorld(back, back.spanH, 0), [-wallOuter, 0, back.origin[2]]);
    expectPoint(wallPointToWorld(right, right.spanH, 0), [wallOuter, 0, back.origin[2] + back.thickness]);
    expectPoint(wallPointToWorld(left, 0, 0), [-wallOuter, 0, front.origin[2] - front.thickness]);
    expect(right.spanH).toBeCloseTo(base.length + FRAME_FLANGE_WIDTH + 2 * END_WALL_GIRT_DEPTH, 12);
    expect(front.spanH).toBeCloseTo(2 * wallOuter, 12);
  });

  it('gives all four walls the same eave height, so the tops meet', () => {
    const eave = layout.walls.left.spanV;
    for (const key of WALLS) expect(layout.walls[key].spanV).toBe(eave);
    expect(layout.walls.left.apexV).toBe(eave);
    expect(layout.walls.front.apexV).toBeGreaterThan(eave);
  });

  it('describes side walls as rectangles and gables as symmetric pentagons under the roof', () => {
    const { front, right } = layout.walls;
    expect(right.polygon).toEqual([
      [0, 0],
      [right.spanH, 0],
      [right.spanH, right.spanV],
      [0, right.spanV],
    ]);
    expect(front.polygon).toEqual([
      [0, 0],
      [front.spanH, 0],
      [front.spanH, front.spanV],
      [front.spanH / 2, front.apexV],
      [0, front.spanV],
    ]);
    // The gable's sloping edges run at the roof pitch and touch the roof underside at the ridge.
    expect((front.apexV - front.spanV) / (front.spanH / 2)).toBeCloseTo(Math.tan(layout.pitch), 9);
    expect(front.apexV).toBeCloseTo(layout.roof[0].ridge[1], 12);
    expect(layout.walls.back.polygon).toEqual(front.polygon);
  });

  it('reports face areas', () => {
    const { front, right } = layout.walls;
    expect(right.area).toBeCloseTo(right.spanH * right.spanV, 9);
    expect(front.area).toBeCloseTo(front.spanH * front.spanV + (front.spanH * (front.apexV - front.spanV)) / 2, 9);
    expect(
      polygonArea([
        [0, 0],
        [2, 0],
        [2, 3],
        [0, 3],
      ]),
    ).toBe(6);
  });

  it('lists the column axes behind each wall in wall coordinates', () => {
    const { front, back, left, right } = layout.walls;
    expect(left.supports).toHaveLength(layout.frames.length);
    expect(right.supports).toEqual(left.supports);
    layout.frames.forEach((frame, i) => {
      expect(wallPointToWorld(right, right.supports[i], 0)[2]).toBeCloseTo(frame.z, 9);
      expect(wallPointToWorld(left, left.supports[i], 0)[2]).toBeCloseTo(frame.z, 9);
    });
    expectPoint(wallPointToWorld(front, front.supports[0], 0), [-columnAxis, 0, front.origin[2]]);
    expectPoint(wallPointToWorld(front, front.supports[1], 0), [columnAxis, 0, front.origin[2]]);
    expectPoint(wallPointToWorld(back, back.supports[0], 0), [columnAxis, 0, back.origin[2]]);
    expect(front.supportHalfWidth).toBe(COLUMN_DEPTH / 2);
    expect(left.supportHalfWidth).toBe(FRAME_FLANGE_WIDTH / 2);
  });

  it('measures h from the front on both side walls', () => {
    const { left, right } = layout.walls;
    expectPoint(wallPointToWorld(left, 10, 2), [left.origin[0], 2, left.origin[2] - 10]);
    expectPoint(wallPointToWorld(right, 10, 2, 0.5), [right.origin[0] + 0.5, 2, right.origin[2] - 10]);
  });
});

describe('wallHeightAt', () => {
  const { front, right } = layoutOf().walls;

  it.each([
    [0, 0],
    [0.25, 0.5],
    [0.5, 1],
    [0.75, 0.5],
    [1, 0],
  ])('gable at %s of its span is %s of the way up to the apex', (fraction, towardsApex) => {
    const expected = front.spanV + (front.apexV - front.spanV) * towardsApex;
    expect(wallHeightAt(front, fraction * front.spanH)).toBeCloseTo(expected, 9);
  });

  it('is the eave height everywhere on a side wall, and outside a gable', () => {
    expect(wallHeightAt(right, 0)).toBe(right.spanV);
    expect(wallHeightAt(right, right.spanH / 2)).toBe(right.spanV);
    expect(wallHeightAt(front, -1)).toBe(front.spanV);
    expect(wallHeightAt(front, front.spanH + 1)).toBe(front.spanV);
  });
});

describe('walls across sizes', () => {
  it.each([
    [8, 3, 12],
    [12, 4, 18],
    [17, 5.5, 48],
    [20, 6, 102],
  ])('W %s, H %s, L %s: walls reach from the floor to just above the clear height', (width, height, length) => {
    const layout = layoutOf({ width, height, length });
    for (const key of WALLS) {
      const wall = layout.walls[key];
      expect(wall.origin[1]).toBe(0);
      expect(wall.spanV).toBeGreaterThan(height);
      expect(wall.spanV).toBeLessThan(height + 0.6);
      expect(wall.polygon[0]).toEqual([0, 0]);
    }
    const { front } = layout.walls;
    expect(front.apexV - front.spanV).toBeCloseTo(layout.halfWidths.wallOuter * Math.tan(layout.pitch), 9);
  });
});
