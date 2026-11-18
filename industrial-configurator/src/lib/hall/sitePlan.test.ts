import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import { BAY, planSite, type SiteRect } from './sitePlan';
import type { HallParams } from './types';

const base: HallParams = { length: 30, width: 15, height: 5, foundation: true, panels: true, insulationMm: 80 };
const overlaps = (a: SiteRect, b: SiteRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const inside = (a: SiteRect, b: SiteRect) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1;

const SIZES: Partial<HallParams>[] = [
  { width: 8, height: 3, length: 12 },
  { width: 20, height: 6, length: 102 },
  { width: 15, length: 30, roofType: 'mono', highSide: 'left' },
  { width: 12, length: 48, foundation: false },
];

describe('planSite', () => {
  for (const size of SIZES) {
    it(`surrounds the hall with a yard and keeps bays off the building (${JSON.stringify(size)})`, () => {
      const layout = computeHallLayout({ ...base, ...size });
      const plan = planSite(layout);
      expect(inside(plan.footprint, plan.yard)).toBe(true);
      expect(plan.road.z0).toBe(plan.yard.z1);
      expect(plan.bays.length).toBeGreaterThan(0);
      expect(plan.bays.length).toBeLessThanOrEqual(16);
      for (const bay of plan.bays) {
        expect(inside(bay, plan.yard)).toBe(true);
        expect(overlaps(bay, plan.footprint)).toBe(false);
        expect(bay.x1 - bay.x0).toBeCloseTo(BAY.depth, 9);
        expect(bay.z1 - bay.z0).toBeCloseTo(BAY.width, 9);
      }
      for (let i = 1; i < plan.bays.length; i++) expect(overlaps(plan.bays[i - 1], plan.bays[i])).toBe(false);
    });
  }

  it('puts the parking on the side the hero picture shows', () => {
    const gable = planSite(computeHallLayout(base));
    expect(gable.heroSide).toBe('left');
    expect(gable.bays[0].x1).toBeLessThan(gable.footprint.x0);
    const mono = planSite(computeHallLayout({ ...base, roofType: 'mono', highSide: 'left' }));
    expect(mono.heroSide).toBe('right');
    expect(mono.bays[0].x0).toBeGreaterThan(mono.footprint.x1);
  });

  it('leaves the ground in front of doors clear', () => {
    const layout = computeHallLayout(base);
    const plan = planSite(layout, [
      { type: 'garageDoor', wallId: 'PereteSTG', offsetX: 4, width: 4 },
      { type: 'garageDoor', wallId: 'PereteFata', offsetX: 5, width: 4 },
      { type: 'window', wallId: 'PereteSTG', offsetX: 12, width: 1.2 },
    ]);
    expect(plan.clear).toHaveLength(2);
    for (const bay of plan.bays) for (const zone of plan.clear) expect(overlaps(bay, zone)).toBe(false);
    expect(plan.bays.length).toBeLessThan(planSite(layout).bays.length);
    // The front doorway's zone reaches out into the front yard.
    const front = plan.clear[1];
    expect(front.z1).toBeGreaterThan(plan.footprint.z1);
  });

  it('is deterministic', () => {
    const layout = computeHallLayout({ ...base, width: 20, length: 102 });
    expect(planSite(layout)).toEqual(planSite(layout));
  });
});
