import { describe, expect, it } from 'vitest';
import { computeHallLayout, type HallParams } from '@/lib/hall';
import {
  clampFraction,
  closestOnAxis,
  isClipped,
  sectionCaps,
  sectionCoordinate,
  sectionExtents,
  sectionFraction,
  sectionPlane,
  sectionRange,
  subtractIntervals,
  type SectionExtents,
} from './section';
import { ALL_LAYERS_VISIBLE } from './layers';

const extents: SectionExtents = { x: [-8, 8], z: [-15, 15] };
const base: HallParams = { length: 30, width: 15, height: 5, foundation: true, panels: true, insulationMm: 80 };

describe('sectionPlane', () => {
  it('is null when the section is off', () => {
    expect(sectionPlane('off', 0.5, extents)).toBeNull();
  });

  it('cuts across the width at mid-span by default (transversal: square to Z, keeps z <= cut)', () => {
    const plane = sectionPlane('transversal', 0.5, extents)!;
    expect(plane.axis).toBe('z');
    expect(plane.coordinate).toBeCloseTo(0);
    expect(plane.normal).toEqual([0, 0, -1]);
    expect(isClipped([0, 0, 1], plane)).toBe(true);
    expect(isClipped([0, 0, -1], plane)).toBe(false);
  });

  it('cuts along the length (longitudinal: square to X, keeps x >= cut)', () => {
    const plane = sectionPlane('longitudinal', 0.25, extents)!;
    expect(plane.axis).toBe('x');
    const [a, b] = sectionRange('x', extents);
    expect(plane.coordinate).toBeCloseTo(a + 0.25 * (b - a));
    expect(isClipped([plane.coordinate - 1, 3, 0], plane)).toBe(true);
    expect(isClipped([plane.coordinate + 1, 3, 0], plane)).toBe(false);
  });

  it('clamps the position to the hall extents (inset a centimetre)', () => {
    expect(sectionPlane('transversal', 7, extents)!.coordinate).toBeCloseTo(14.99);
    expect(sectionPlane('transversal', -3, extents)!.coordinate).toBeCloseTo(-14.99);
    expect(sectionCoordinate('x', Number.NaN, extents)).toBeCloseTo(0);
  });

  it('round-trips coordinate and fraction, clamped', () => {
    expect(sectionFraction('z', sectionCoordinate('z', 0.3, extents), extents)).toBeCloseTo(0.3);
    expect(sectionFraction('z', 100, extents)).toBe(1);
    expect(sectionFraction('z', -100, extents)).toBe(0);
  });

  it('takes its extents from the layout bounds', () => {
    const layout = computeHallLayout(base);
    const e = sectionExtents(layout);
    expect(e.x).toEqual([layout.bounds.min[0], layout.bounds.max[0]]);
    expect(e.z).toEqual([layout.bounds.min[2], layout.bounds.max[2]]);
  });
});

describe('isClipped', () => {
  it('never clips without a plane, keeps points on the plane, accepts Vector3-like points', () => {
    const plane = sectionPlane('transversal', 0.5, extents)!;
    expect(isClipped([0, 0, 100], null)).toBe(false);
    expect(isClipped([0, 0, plane.coordinate], plane)).toBe(false);
    expect(isClipped({ x: 0, y: 0, z: 5 }, plane)).toBe(true);
  });
});

describe('clampFraction', () => {
  it('keeps 0..1 and falls back to mid-span for non-numbers', () => {
    expect(clampFraction(0.4)).toBe(0.4);
    expect(clampFraction(2)).toBe(1);
    expect(clampFraction(-1)).toBe(0);
    expect(clampFraction(Number.POSITIVE_INFINITY)).toBe(0.5);
  });
});

describe('closestOnAxis', () => {
  it('finds where a ray passes the drag line', () => {
    // A ray looking straight down at x = 3 crosses the X line through the origin at x = 3.
    expect(closestOnAxis([3, 10, 0], [0, -1, 0], 'x', [0, 0, 0])).toBeCloseTo(3);
    expect(closestOnAxis([0, 10, -4], [0, -1, 0.0], 'z', [0, 0, 0])).toBeCloseTo(-4);
  });
  it('is null for a ray along the axis', () => {
    expect(closestOnAxis([0, 0, 0], [1, 0, 0], 'x', [0, 0, 0])).toBeNull();
  });
});

describe('subtractIntervals', () => {
  it('removes the cuts', () => {
    expect(subtractIntervals(0, 10, [[2, 3], [5, 12]])).toEqual([[0, 2], [3, 5]]);
    expect(subtractIntervals(0, 10, [])).toEqual([[0, 10]]);
  });
});

describe('sectionCaps', () => {
  const layout = computeHallLayout(base);
  const plane = (mode: 'transversal' | 'longitudinal') => sectionPlane(mode, 0.5, sectionExtents(layout))!;

  it('fills the walls, the roof and the slab crossed by a transversal cut', () => {
    // Two side walls, one roof cross-section, the slab.
    expect(sectionCaps(layout, plane('transversal')).length).toBe(4);
  });

  it('fills the end walls, the roof and the slab crossed by a longitudinal cut, also right on the ridge', () => {
    const atRidge = plane('longitudinal');
    expect(atRidge.coordinate).toBeCloseTo(layout.roof[0].ridge[0]);
    expect(sectionCaps(layout, atRidge).length).toBe(4);
    expect(sectionCaps(layout, sectionPlane('longitudinal', 0.3, sectionExtents(layout))!).length).toBe(4);
  });

  it('leaves out hidden layers and the cladding hidden in step 1', () => {
    const all = sectionCaps(layout, plane('transversal')).length;
    expect(sectionCaps(layout, plane('transversal'), { layers: { ...ALL_LAYERS_VISIBLE, roof: false } }).length).toBe(all - 1);
    expect(sectionCaps(layout, plane('transversal'), { claddingVisible: false }).length).toBe(1);
    expect(sectionCaps(layout, plane('transversal'), { claddingVisible: false, layers: { ...ALL_LAYERS_VISIBLE, foundation: false } })).toEqual([]);
  });

  it('splits a wall cap around an opening it crosses', () => {
    const wall = layout.walls.left;
    const holes = [{ wallId: wall.id, offsetX: wall.spanH / 2 - 1.5, sill: 1, width: 3, height: 2 }];
    const without = sectionCaps(layout, plane('transversal'), { layers: { ...ALL_LAYERS_VISIBLE, roof: false, foundation: false } });
    const withHole = sectionCaps(layout, plane('transversal'), { holes, layers: { ...ALL_LAYERS_VISIBLE, roof: false, foundation: false } });
    expect(withHole.length).toBe(without.length + 1);
  });
});
