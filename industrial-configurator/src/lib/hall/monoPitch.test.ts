/** The single-slope ("o apă") roof: layout, kit placements, openings on its end walls and pricing. */
import { describe, expect, it } from 'vitest';
import { computeHallLayout, faceHeightAt, wallPointToWorld, type Side } from '@/lib/hall';
import { placeKit } from '@/components/3d/hall/placements';
import { clampOpening } from '@/components/3d/openings/openingMath';
import { wallSpansFromLayout } from '@/components/3d/openings/validateOpenings';
import { wallArea } from '@/lib/pricing';

const base = { length: 18, width: 12, height: 6, foundation: true, panels: false, insulationMm: 0 };
const mono = (highSide: Side) => computeHallLayout({ ...base, roofType: 'mono', highSide });
const gable = computeHallLayout(base);

describe.each(['left', 'right'] as const)('mono-pitch roof, high side %s', (highSide) => {
  const layout = mono(highSide);
  const lowSide: Side = highSide === 'left' ? 'right' : 'left';
  const rise = 2 * layout.halfWidths.columnInner * Math.tan(layout.pitch);

  it('keeps the low eave where a gable eave is and raises the other by width * tan(pitch)', () => {
    expect(layout.roofType).toBe('mono');
    expect(layout.highSide).toBe(highSide);
    expect(layout.eaveY).toBeCloseTo(gable.eaveY, 9);
    expect(layout.ridgeY - layout.eaveY).toBeCloseTo(rise, 9);
    const low = layout.columns.find((c) => c.side === lowSide)!;
    const high = layout.columns.find((c) => c.side === highSide)!;
    expect(low.isHigh).toBe(false);
    expect(high.isHigh).toBe(true);
    expect(high.topY - low.topY).toBeCloseTo(rise, 9);
    expect(high.girtLevels.length).toBeGreaterThanOrEqual(low.girtLevels.length);
  });

  it('spans each frame with one rafter from the low eave to the high one', () => {
    expect(layout.rafters).toHaveLength(layout.frames.length);
    for (const r of layout.rafters) {
      expect(r.side).toBe(lowSide);
      expect(r.to[0]).toBeCloseTo(-r.from[0], 9);
      expect(r.to[1] - r.from[1]).toBeCloseTo(rise, 9);
      expect(r.length).toBeCloseTo(Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]), 9);
    }
  });

  it('puts every purlin on the slope, spaced no wider than a gable', () => {
    const xs = layout.purlins.map((p) => p.x).sort((a, b) => a - b);
    for (const p of layout.purlins) {
      const steelTop = layout.rafters[0].from[1] + (p.x - layout.rafters[0].from[0]) * (rise / (layout.rafters[0].to[0] - layout.rafters[0].from[0]));
      expect(p.y).toBeGreaterThan(steelTop);
    }
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1.6 / (1 / Math.cos(layout.pitch)) + 1e-9);
  });

  it('has one roof plane, one gutter and its two downpipes, all on the low side', () => {
    expect(layout.roof).toHaveLength(1);
    expect(layout.roof[0].side).toBe(lowSide);
    expect(layout.roof[0].ridge[1] - layout.roof[0].eave[1]).toBeCloseTo(2 * layout.halfWidths.roofEdge * Math.tan(layout.pitch), 9);
    expect(layout.gutters.map((g) => g.side)).toEqual([lowSide]);
    expect(layout.downpipes).toHaveLength(2);
    expect(layout.downpipes.every((d) => d.side === lowSide)).toBe(true);
  });

  it('draws trapezoid end walls that meet the roof underside at both ends', () => {
    for (const key of ['front', 'back'] as const) {
      const wall = layout.walls[key];
      expect(wall.polygon).toHaveLength(4);
      expect(wall.apexV - wall.spanV).toBeCloseTo(2 * layout.halfWidths.wallOuter * Math.tan(layout.pitch), 9);
      // The apex end of the face is on the high side of the hall.
      const [x] = wallPointToWorld(wall, wall.apexH, 0);
      expect(Math.sign(x)).toBe(highSide === 'left' ? -1 : 1);
      expect(faceHeightAt(wall, wall.apexH)).toBeCloseTo(wall.apexV, 9);
      expect(faceHeightAt(wall, wall.spanH - wall.apexH)).toBeCloseTo(wall.spanV, 9);
    }
    expect(layout.walls[highSide].spanV - layout.walls[lowSide].spanV).toBeCloseTo(
      2 * layout.halfWidths.wallOuter * Math.tan(layout.pitch),
      9,
    );
  });

  it('places the high-side joint, no ridge joint and no ridge cap', () => {
    const kit = placeKit(layout);
    expect(kit.EaveHaunch).toHaveLength(layout.frames.length);
    expect(kit.EaveHaunchHigh).toHaveLength(layout.frames.length);
    expect(kit.RidgeJoint).toHaveLength(0);
    expect(kit.RidgeCap).toHaveLength(0);
    expect(kit.Gutter).toHaveLength(1);
  });

  it('lets a tall opening sit only towards the high end of an end wall', () => {
    const spans = wallSpansFromLayout(layout);
    const front = spans.PereteFata;
    const tall = clampOpening(
      { id: 'g', type: 'garageDoor', wallId: 'PereteFata', offsetX: 0, sill: 0, width: 3, height: front.height + 1 },
      front,
    );
    // Its top is above the low eave, so it must be pushed to where the face is that high.
    const top = tall.sill + tall.height;
    expect(top).toBeGreaterThan(front.height);
    const wall = layout.walls.front;
    expect(faceHeightAt(wall, tall.offsetX)).toBeGreaterThanOrEqual(top - 1e-9);
    expect(faceHeightAt(wall, tall.offsetX + tall.width)).toBeGreaterThanOrEqual(top - 1e-9);
  });
});

describe('gable roof is unchanged', () => {
  it('still has two planes, two gutters and a ridge', () => {
    expect(gable.roofType).toBe('gable');
    expect(gable.highSide).toBeNull();
    expect(gable.roof).toHaveLength(2);
    expect(gable.gutters).toHaveLength(2);
    const kit = placeKit(gable);
    expect(kit.EaveHaunchHigh).toHaveLength(0);
    expect(kit.RidgeCap).toHaveLength(1);
  });
});

describe('pricing of a mono-pitch hall', () => {
  it('counts the taller high-side wall', () => {
    const dims = { length: 18, width: 12, height: 6 };
    const extra = wallArea({ ...dims, roofType: 'mono' }) - wallArea(dims);
    expect(extra).toBeCloseTo(18 * 12 * Math.tan((10 * Math.PI) / 180), 9);
  });
});
