import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import { planSite, type SiteRect } from './sitePlan';
import { COLUMN_DEPTH, FRAME_FLANGE_WIDTH } from './constants';
import type { SiteOpening } from './sitePlan';
import { wallPointToWorld } from './walls';
import { planInteriorProps, planProps, propRect, seededRandom, sightWedge, type Prop } from './propPlan';
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

describe('planInteriorProps', () => {
  const EPS = 1e-4;
  const door: SiteOpening = { type: 'garageDoor', wallId: 'PereteFata', offsetX: 5, width: 4 };
  const side: SiteOpening = { type: 'door', wallId: 'PereteSTG', offsetX: 6, width: 1 };
  const openings = [door, side];
  const keepClear = [{ x: 0, z: -15, r: 2 }];
  const shrink = (r: SiteRect): SiteRect => ({ x0: r.x0 + EPS, x1: r.x1 - EPS, z0: r.z0 + EPS, z1: r.z1 - EPS });

  const zonesOf = (layout: ReturnType<typeof computeHallLayout>) =>
    openings.map((o) => {
      const wall = Object.values(layout.walls).find((w) => w.id === o.wallId)!;
      const depth = o.type === 'garageDoor' ? 6 : 2;
      const a = wallPointToWorld(wall, o.offsetX - 0.5, 0);
      const b = wallPointToWorld(wall, o.offsetX + o.width + 0.5, 0);
      const c = wallPointToWorld(wall, o.offsetX, 0, -depth);
      return { x0: Math.min(a[0], b[0], c[0]), x1: Math.max(a[0], b[0], c[0]), z0: Math.min(a[2], b[2], c[2]), z1: Math.max(a[2], b[2], c[2]) };
    });

  it('is deterministic', () => {
    const layout = computeHallLayout(base);
    expect(planInteriorProps(layout, openings, keepClear)).toEqual(planInteriorProps(layout, openings, keepClear));
  });

  it('stays inside, out of doorways, keep-clear circles, columns and each other', () => {
    for (const size of [{}, { width: 20, length: 60, height: 8 }, { width: 12, length: 24, roofType: 'mono' as const, highSide: 'left' as const }]) {
      const layout = computeHallLayout({ ...base, ...size });
      const inner = layout.halfWidths.columnInner;
      const props = planInteriorProps(layout, openings, size.length === 60 ? [] : keepClear);
      const zones = zonesOf(layout);
      expect(count(props, 'rack')).toBeGreaterThan(2);
      expect(count(props, 'forklift')).toBe(1);
      expect(count(props, 'pallets')).toBeGreaterThanOrEqual(1);
      expect(count(props, 'worker')).toBeGreaterThanOrEqual(1);
      props.forEach((p, i) => {
        const r = shrink(propRect(p));
        expect(r.x0).toBeGreaterThanOrEqual(-inner + 0.4 - 2 * EPS);
        expect(r.x1).toBeLessThanOrEqual(inner - 0.4 + 2 * EPS);
        expect(r.z0).toBeGreaterThanOrEqual(-layout.params.length + 0.4 - 2 * EPS);
        expect(r.z1).toBeLessThanOrEqual(-0.4 + 2 * EPS);
        for (const z of zones) expect(overlaps(r, z), `${p.kind} in a doorway`).toBe(false);
        for (const c of layout.columns) {
          expect(overlaps(r, { x0: c.x - COLUMN_DEPTH / 2, x1: c.x + COLUMN_DEPTH / 2, z0: c.z - FRAME_FLANGE_WIDTH / 2, z1: c.z + FRAME_FLANGE_WIDTH / 2 }), `${p.kind} on a column`).toBe(false);
        }
        if (size.length !== 60) {
          const dx = Math.max(r.x0 - 0, 0, 0 - r.x1);
          const dz = Math.max(r.z0 + 15, 0, -15 - r.z1);
          expect(Math.hypot(dx, dz), `${p.kind} in a keep-clear circle`).toBeGreaterThanOrEqual(2);
        }
        for (const q of props.slice(i + 1)) expect(overlaps(r, shrink(propRect(q))), `${p.kind} on ${q.kind}`).toBe(false);
      });
    }
  });

  it('caps the rack height and keeps them on the side with fewer openings', () => {
    const tall = computeHallLayout({ ...base, height: 12, width: 20, length: 40 });
    const racks = planInteriorProps(tall, openings).filter((p) => p.kind === 'rack');
    expect(racks.length).toBeGreaterThan(0);
    for (const r of racks) expect(r.size!.h).toBe(6);
    expect(racks.every((r) => r.x > 0)).toBe(true); // the left wall has a door
    const low = computeHallLayout({ ...base, height: 4 });
    for (const r of planInteriorProps(low, []).filter((p) => p.kind === 'rack')) expect(r.size!.h).toBeCloseTo(3.2);
  });

  it('keeps small halls sparse', () => {
    for (const size of [{ width: 7, length: 20 }, { width: 12, length: 9 }]) {
      const props = planInteriorProps(computeHallLayout({ ...base, ...size }), [door]);
      expect(count(props, 'rack')).toBe(0);
      expect(count(props, 'forklift')).toBe(0);
      expect(count(props, 'worker')).toBeLessThanOrEqual(1);
      expect(count(props, 'pallets')).toBeLessThanOrEqual(1);
    }
  });

  it('skips the forklift without a garage door', () => {
    expect(count(planInteriorProps(computeHallLayout(base), []), 'forklift')).toBe(0);
  });
});
