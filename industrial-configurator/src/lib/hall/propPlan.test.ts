import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import { planSite, type SiteRect } from './sitePlan';
import { planProps, propRect, seededRandom, sightWedge, type Prop } from './propPlan';
import { renderViewCameras } from './renderViews';
import type { HallParams } from './types';

const base: HallParams = { length: 30, width: 15, height: 5, foundation: true, panels: true, insulationMm: 80 };
const overlaps = (a: SiteRect, b: SiteRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const count = (props: Prop[], kind: Prop['kind']) => props.filter((p) => p.kind === kind).length;

const SIZES: Partial<HallParams>[] = [
  { width: 8, height: 3, length: 12 },
  { width: 20, height: 6, length: 102 },
  { width: 15, length: 30, roofType: 'mono', highSide: 'left' },
  { width: 12, length: 48, foundation: false },
];

describe('planProps', () => {
  for (const size of SIZES) {
    it(`dresses the site without touching the hall, the road or doorways (${JSON.stringify(size)})`, () => {
      const layout = computeHallLayout({ ...base, ...size });
      const plan = planSite(layout, [{ type: 'garageDoor', wallId: 'PereteFata', offsetX: 1, width: 4 }]);
      const props = planProps(plan);

      expect(count(props, 'car')).toBeGreaterThanOrEqual(2);
      expect(count(props, 'car')).toBeLessThanOrEqual(6);
      expect(count(props, 'worker')).toBe(2);
      expect(count(props, 'van')).toBe(1);
      expect(count(props, 'tree')).toBeGreaterThan(10);
      expect(count(props, 'building')).toBeGreaterThan(4);

      for (const p of props) {
        const r = propRect(p);
        expect(overlaps(r, plan.footprint), `${p.kind} on the hall`).toBe(false);
        expect(overlaps(r, plan.road), `${p.kind} on the road`).toBe(false);
        if (['car', 'van', 'worker', 'forklift', 'pallets'].includes(p.kind)) {
          for (const zone of plan.clear) expect(overlaps(r, zone), `${p.kind} in front of a door`).toBe(false);
          expect(r.x0 >= plan.yard.x0 && r.x1 <= plan.yard.x1 && r.z0 >= plan.yard.z0 && r.z1 <= plan.yard.z1).toBe(true);
        }
      }
      // Vehicles and people never overlap each other.
      const solid = props.filter((p) => ['car', 'van', 'worker', 'forklift', 'pallets'].includes(p.kind));
      for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) expect(overlaps(propRect(solid[i]), propRect(solid[j]))).toBe(false);
      }
    });
  }

  it('is deterministic for a hall, and differs between halls', () => {
    const a = planSite(computeHallLayout(base));
    expect(planProps(a)).toEqual(planProps(a));
    const b = planSite(computeHallLayout({ ...base, length: 36 }));
    expect(planProps(b)).not.toEqual(planProps(a));
  });

  it('parks cars inside bays', () => {
    const plan = planSite(computeHallLayout(base));
    for (const car of planProps(plan).filter((p) => p.kind === 'car')) {
      expect(plan.bays.some((bay) => car.x > bay.x0 && car.x < bay.x1 && car.z > bay.z0 && car.z < bay.z1)).toBe(true);
    }
  });
});

describe('views stay clear', () => {
  it('leaves out trees, bushes and buildings between a render camera and the hall', () => {
    for (const size of SIZES) {
      const layout = computeHallLayout({ ...base, ...size });
      const plan = planSite(layout);
      const viewpoints = Object.values(renderViewCameras(layout, 1.6)).map((c) => [c.position[0], c.position[2]] as [number, number]);
      const all = planProps(plan);
      const kept = planProps(plan, viewpoints);
      expect(kept.length).toBeLessThan(all.length);
      expect(count(kept, 'car')).toBe(count(all, 'car')); // vehicles and people are never removed
      expect(count(kept, 'tree')).toBeGreaterThan(4);
      for (const v of viewpoints) {
        const wedge = sightWedge(v, plan.footprint);
        for (const p of kept.filter((q) => q.kind === 'tree')) {
          // Point-in-polygon by winding: no tree centre inside a sight wedge.
          let inside = true;
          for (let i = 0; i < wedge.length; i++) {
            const [ax, az] = wedge[i];
            const [bx, bz] = wedge[(i + 1) % wedge.length];
            if ((bx - ax) * (p.z - az) - (bz - az) * (p.x - ax) < 0) inside = false;
          }
          expect(inside).toBe(false);
        }
      }
    }
  });
});

describe('seededRandom', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
