import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import {
  COLUMN_DEPTH,
  MAX_BAY_SPACING,
  MAX_PURLIN_SPACING,
  ROOF_PITCH_DEG,
  SHEET_THICKNESS,
  SLAB_THICKNESS,
} from './constants';
import type { HallLayout, HallParams } from './types';

const base: HallParams = { length: 12, width: 12, height: 4, foundation: true, panels: false, insulationMm: 0 };
const layoutOf = (overrides: Partial<HallParams> = {}) => computeHallLayout({ ...base, ...overrides });

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

const WIDTHS = range(8, 20, 0.5);
const HEIGHTS = range(3, 6, 0.5);
const LENGTHS = [12, 12.5, 13, 17, 18, 24.3, 30, 47.9, 48, 60, 99.9, 102];

/** Every number anywhere in the layout. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn);
  return [];
}

/** Invariants that must hold for any hall, whatever its size. */
function expectSoundLayout(layout: HallLayout) {
  const { params, halfWidths } = layout;
  expect(numbersIn(layout).every(Number.isFinite)).toBe(true);

  // Heights stack up: clear height < top of steel at the eave < top of steel at the ridge < roof skin.
  expect(layout.eaveY).toBeGreaterThan(params.height);
  expect(layout.ridgeY).toBeGreaterThan(layout.eaveY);
  expect(layout.bounds.max[1]).toBeGreaterThan(layout.ridgeY);
  expect(layout.ridgeY - layout.eaveY).toBeCloseTo((params.width / 2) * Math.tan(layout.pitch), 9);

  // Frames cover exactly [0, -length] at one equal spacing that never exceeds the maximum bay.
  expect(layout.frames[0].z).toBe(0);
  expect(layout.frames.at(-1)!.z).toBe(-params.length);
  expect(layout.frames).toHaveLength(layout.bayCount + 1);
  expect(layout.bay).toBeLessThanOrEqual(params.bay + 1e-9);
  layout.frames.slice(1).forEach((frame, i) => {
    expect(layout.frames[i].z - frame.z).toBeCloseTo(layout.bay, 9);
  });

  // Two columns and two rafters per frame; the clear width is exactly the requested one.
  expect(layout.columns).toHaveLength(2 * layout.frames.length);
  expect(layout.rafters).toHaveLength(2 * layout.frames.length);
  expect(2 * halfWidths.columnInner).toBeCloseTo(params.width, 9);
  for (const column of layout.columns) {
    expect(Math.abs(column.x)).toBeCloseTo(halfWidths.columnAxis, 9);
    expect(column.height).toBeGreaterThan(0);
    expect(column.topY).toBeLessThan(params.height);
  }
  for (const rafter of layout.rafters) {
    expect(rafter.from[1]).toBeCloseTo(params.height, 9);
    expect(rafter.to[0]).toBe(0);
    const run = Math.hypot(rafter.to[0] - rafter.from[0], rafter.to[1] - rafter.from[1]);
    expect(run).toBeCloseTo(rafter.length, 9);
  }

  // Purlins: same count on both slopes, strictly inside the rafter span, on the rafter, close enough together.
  expect(layout.purlins).toHaveLength(2 * layout.purlinsPerSide);
  expect(layout.purlinsPerSide).toBeGreaterThanOrEqual(2);
  for (const side of ['left', 'right'] as const) {
    const seats = layout.purlins.filter((purlin) => purlin.side === side);
    expect(seats).toHaveLength(layout.purlinsPerSide);
    seats.forEach((purlin, i) => {
      const distance = Math.abs(purlin.x);
      expect(Math.sign(purlin.x)).toBe(side === 'left' ? -1 : 1);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(halfWidths.columnOuter);
      expect(purlin.y).toBeCloseTo(layout.ridgeY - distance * Math.tan(layout.pitch), 9);
      expect(purlin.zFrom).toBeGreaterThanOrEqual(0);
      expect(purlin.zTo).toBeLessThanOrEqual(-params.length);
      if (i > 0) {
        const alongSlope = (distance - Math.abs(seats[i - 1].x)) / Math.cos(layout.pitch);
        expect(alongSlope).toBeGreaterThan(0);
        expect(alongSlope).toBeLessThanOrEqual(MAX_PURLIN_SPACING + 1e-9);
      }
    });
  }

  // The envelope nests: column < cladding < roof edge, and the roof covers both gables.
  expect(halfWidths.columnOuter).toBeLessThan(halfWidths.wallInner);
  expect(halfWidths.wallInner).toBeLessThan(halfWidths.wallOuter);
  expect(halfWidths.wallOuter).toBeLessThan(halfWidths.roofEdge);
  expect(layout.roof.right.zFront).toBeGreaterThan(layout.walls.front.origin[2]);
  expect(layout.roof.right.zBack).toBeLessThan(layout.walls.back.origin[2]);
  expect(layout.roof.left.eave[1]).toBeLessThan(layout.roof.left.ridge[1]);
  expect(layout.roof.left.eave[0]).toBe(-layout.roof.right.eave[0]);
}

describe('computeHallLayout: invariants across the sellable range', () => {
  it.each(WIDTHS)('width %s m, every height', (width) => {
    for (const height of HEIGHTS) expectSoundLayout(layoutOf({ width, height }));
  });

  it.each(LENGTHS)('length %s m, narrowest and widest hall', (length) => {
    expectSoundLayout(layoutOf({ length, width: 8, height: 3 }));
    expectSoundLayout(layoutOf({ length, width: 20, height: 6, panels: true, insulationMm: 250 }));
  });

  it.each([7, 21, 30, 12.345])('width %s m outside the sold range still gives a sound hall', (width) => {
    expectSoundLayout(layoutOf({ width }));
  });
});

describe('computeHallLayout: bays', () => {
  it.each([
    [12, 2, 6],
    [12.5, 3, 12.5 / 3],
    [17, 3, 17 / 3],
    [18, 3, 6],
    [18.01, 4, 18.01 / 4],
    [48, 8, 6],
    [102, 17, 6],
    [5, 1, 5],
  ])('length %s m -> %s bays of %s m', (length, bayCount, bay) => {
    const layout = layoutOf({ length });
    expect(layout.bayCount).toBe(bayCount);
    expect(layout.bay).toBeCloseTo(bay, 9);
  });

  it('keeps every multiple of the maximum bay on the exact grid', () => {
    for (const length of range(12, 102, MAX_BAY_SPACING)) {
      const layout = layoutOf({ length });
      expect(layout.bay).toBe(MAX_BAY_SPACING);
      expect(layout.frames.map((frame) => frame.z)).toEqual(range(0, length, 6).map((z) => (z === 0 ? 0 : -z)));
    }
  });

  it('honours a custom maximum bay', () => {
    expect(layoutOf({ length: 30, bay: 5 }).bayCount).toBe(6);
    expect(layoutOf({ length: 30, bay: 7.5 }).bayCount).toBe(4);
  });

  it('marks only the first and last frame as end frames', () => {
    expect(layoutOf({ length: 30 }).frames.map((frame) => frame.isEnd)).toEqual([true, false, false, false, false, true]);
  });
});

describe('computeHallLayout: purlins', () => {
  // 12, 15 and 18 m are the widths the original engine rendered correctly: 5, 6 and 7 purlins per slope.
  it.each([
    [8, 4],
    [9, 4],
    [10, 5],
    [12, 5],
    [12.3, 5],
    [12.5, 6],
    [13.5, 6],
    [15, 6],
    [18, 7],
    [20, 8],
  ])('width %s m -> %s purlins per slope', (width, perSide) => {
    expect(layoutOf({ width }).purlinsPerSide).toBe(perSide);
  });

  it('does not depend on height or length', () => {
    const seats = (layout: HallLayout) => layout.purlins.map((purlin) => purlin.x);
    expect(seats(layoutOf({ height: 6, length: 102 }))).toEqual(seats(layoutOf({ height: 3, length: 12 })));
  });

  it('moves seats continuously with width while the count stays the same', () => {
    const a = layoutOf({ width: 12 });
    const b = layoutOf({ width: 12.01 });
    expect(b.purlinsPerSide).toBe(a.purlinsPerSide);
    b.purlins.forEach((purlin, i) => expect(Math.abs(purlin.x - a.purlins[i].x)).toBeLessThanOrEqual(0.005 + 1e-9));
  });
});

describe('computeHallLayout: matches the source frame (da.glb, 12 m wide, rafter underside at 6.0735 m)', () => {
  const layout = layoutOf({ width: 12, height: 6.0735, length: 6 });
  const near = (actual: number, expected: number, tolerance: number) =>
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

  it('uses the measured roof pitch', () => {
    expect(layout.pitch).toBeCloseTo((ROOF_PITCH_DEG * Math.PI) / 180, 12);
  });
  it('puts the column faces at 6.00 / 6.29 m', () => {
    expect(layout.halfWidths.columnInner).toBe(6);
    near(layout.halfWidths.columnOuter, 6.29, 0.011);
  });
  it('ends the column steel at 5.815 m', () => near(layout.columns[0].topY, 5.815, 0.001));
  it('puts the rafter top at the apex near 7.43 m', () => near(layout.ridgeY, 7.435, 0.01));
  it('seats the purlins near 0.09, 1.64, 3.16, 4.68 and 6.22 m', () => {
    const seats = layout.purlins.filter((purlin) => purlin.side === 'right').map((purlin) => purlin.x);
    [0.09, 1.64, 3.16, 4.68, 6.22].forEach((expected, i) => near(seats[i], expected, 0.03));
  });
  it('puts the eave purlin seat near y = 6.335 m', () => near(layout.purlins.at(-1)!.y, 6.335, 0.01));
  it('puts the wall top and the roof edge near 6.41 m', () => {
    near(layout.walls.right.spanV, 6.41, 0.03);
    near(layout.roof.right.eave[1], 6.395, 0.03);
  });
});

describe('computeHallLayout: cladding, slab and site', () => {
  it('uses plain sheeting without sandwich panels, whatever the insulation value', () => {
    expect(layoutOf({ panels: false, insulationMm: 200 }).panelThickness).toBe(SHEET_THICKNESS);
  });

  it.each([30, 100, 250])('grows the cladding outwards by a %s mm sandwich core', (insulationMm) => {
    const thin = layoutOf({ panels: false });
    const thick = layoutOf({ panels: true, insulationMm });
    expect(thick.panelThickness).toBeCloseTo(insulationMm / 1000, 12);
    expect(thick.halfWidths.wallInner).toBe(thin.halfWidths.wallInner);
    expect(thick.halfWidths.wallOuter).toBeCloseTo(thick.halfWidths.wallInner + insulationMm / 1000, 12);
    expect(thick.columns).toEqual(thin.columns);
    expect(thick.roof.left.thickness).toBeCloseTo(insulationMm / 1000, 12);
  });

  it('lowers the terrain below the slab only when there is a foundation', () => {
    expect(layoutOf({ foundation: true }).groundY).toBe(-SLAB_THICKNESS);
    expect(layoutOf({ foundation: false }).groundY).toBe(0);
    expect(layoutOf().slab.topY).toBe(0);
  });

  it('centres the slab under the hall and lets it project beyond the cladding', () => {
    const layout = layoutOf({ length: 30, width: 15 });
    expect(layout.slab.centerZ).toBeCloseTo(-15, 9);
    expect(layout.slab.w).toBeGreaterThan(2 * layout.halfWidths.wallOuter);
    expect(layout.slab.l).toBeGreaterThan(30);
  });

  it('hangs one gutter per eave and a downpipe at each corner', () => {
    const layout = layoutOf({ length: 30 });
    expect(layout.gutters.map((gutter) => gutter.side)).toEqual(['left', 'right']);
    expect(layout.downpipes).toHaveLength(4);
    for (const pipe of layout.downpipes) {
      expect(Math.abs(pipe.x)).toBeGreaterThan(layout.halfWidths.wallOuter);
      expect(pipe.topY).toBeGreaterThan(pipe.bottomY);
    }
  });

  it('stops each downpipe above the floor and puts one at each end of both eaves', () => {
    const pipes = layoutOf({ length: 30 }).downpipes;
    for (const pipe of pipes) expect(pipe.bottomY).toBeGreaterThan(0);
    expect(pipes.map((pipe) => `${pipe.side}-${pipe.end}`).sort()).toEqual(['left-back', 'left-front', 'right-back', 'right-front']);
    for (const pipe of pipes) expect(pipe.z > -15).toBe(pipe.end === 'front');
  });

  it.each([3, 3.5, 4, 5, 6])('spaces the cladding fixings up a %s m column', (height) => {
    const layout = layoutOf({ height });
    const levels = layout.girtLevels;
    expect(levels.length).toBeGreaterThanOrEqual(2);
    expect(levels[0]).toBeGreaterThan(0);
    expect(levels[levels.length - 1]).toBeLessThan(layout.columns[0].topY);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeGreaterThan(0);
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1.5 + 1e-9);
    }
  });

  it('bounds the building, not the apron', () => {
    const layout = layoutOf({ length: 30, width: 15, height: 5 });
    expect(layout.bounds.min).toEqual([-layout.halfWidths.roofEdge, 0, layout.roof.left.zBack]);
    expect(layout.bounds.max[0]).toBe(layout.halfWidths.roofEdge);
    expect(layout.bounds.max[0] - layout.halfWidths.columnInner).toBeLessThan(COLUMN_DEPTH + 0.5);
  });
});

describe('computeHallLayout: purity and input checking', () => {
  it('returns equal layouts for equal input and leaves the input untouched', () => {
    const input = Object.freeze({ ...base, width: 13.5, length: 31 });
    expect(computeHallLayout(input)).toEqual(computeHallLayout({ ...input }));
  });

  it.each([
    ['width', NaN],
    ['width', 0],
    ['height', -3],
    ['length', Infinity],
    ['bay', 0],
  ])('rejects %s = %s', (key, value) => {
    expect(() => layoutOf({ [key]: value } as Partial<HallParams>)).toThrow(RangeError);
  });

  it('treats a missing or negative insulation as none', () => {
    expect(layoutOf({ panels: true, insulationMm: NaN }).panelThickness).toBe(SHEET_THICKNESS);
    expect(layoutOf({ panels: true, insulationMm: -50 }).panelThickness).toBe(SHEET_THICKNESS);
  });
});
