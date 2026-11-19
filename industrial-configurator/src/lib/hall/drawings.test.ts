import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import {
  buildDrawing,
  buildDrawings,
  drawingPointToWorld,
  DRAWING_VIEWS,
  elevationFrame,
  formatMetres,
  formatNumber,
  formatSize,
  roundMm,
  worldToDrawing,
  type DimensionChain,
  type Drawing,
  type DrawingOpening,
} from './drawings';
import type { HallLayout, HallParams } from './types';
import { wallPointToWorld } from './walls';

const base: HallParams = { length: 12, width: 12, height: 4, foundation: true, panels: false, insulationMm: 0 };
const HALLS: Record<string, HallParams> = {
  'gable 12x12x4': base,
  'gable 40x15x5': { ...base, length: 40, width: 15, height: 5, panels: true, insulationMm: 100 },
  'gable 102x20x6': { ...base, length: 102, width: 20, height: 6, foundation: false },
  'mono 30x15x5 high right': { ...base, length: 30, width: 15, height: 5, roofType: 'mono', highSide: 'right' },
  'mono 18x12x6 high left': { ...base, length: 18, width: 12, height: 6, roofType: 'mono', highSide: 'left' },
};

const chain = (d: Drawing, id: string): DimensionChain => {
  const found = d.dimensions.find((c) => c.id === id);
  if (!found) throw new Error(`no chain ${id} in ${d.view}`);
  return found;
};
const sum = (c: DimensionChain) => c.segments.reduce((s, seg) => s + seg.value, 0);
const close = (a: readonly number[], b: readonly number[], digits = 3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('formatting', () => {
  it('writes metres the Romanian way, at most two decimals', () => {
    expect(formatNumber(7.5)).toBe('7,5');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(40 / 7)).toBe('5,71');
    expect(formatNumber(-0.001)).toBe('0');
    expect(formatMetres(7.5)).toBe('7,5 m');
    expect(formatMetres(6)).toBe('6 m');
    expect(formatSize(1.2, 1.5)).toBe('1,2 × 1,5 m');
  });
});

describe.each(Object.entries(HALLS))('%s', (_, params) => {
  const layout: HallLayout = computeHallLayout(params);
  const drawings = buildDrawings(layout);

  it('builds all six views, deterministic and serialisable', () => {
    expect(Object.keys(drawings).sort()).toEqual([...DRAWING_VIEWS].sort());
    expect(JSON.parse(JSON.stringify(drawings))).toEqual(drawings);
    expect(buildDrawings(layout)).toEqual(drawings);
  });

  it('keeps every point inside the bounds and rounded to the millimetre', () => {
    for (const d of Object.values(drawings)) {
      const { min, max } = d.bounds;
      const points = [
        ...d.polylines.flatMap((p) => p.points),
        ...d.labels.map((l) => l.at),
        ...d.axes.map((a) => a.labelAt),
      ];
      expect(points.length).toBeGreaterThan(0);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(min[0]);
        expect(x).toBeLessThanOrEqual(max[0]);
        expect(y).toBeGreaterThanOrEqual(min[1]);
        expect(y).toBeLessThanOrEqual(max[1]);
        expect(Math.abs(x * 1000 - Math.round(x * 1000))).toBeLessThan(1e-6);
      }
      for (const c of d.dimensions) {
        for (const p of c.points) {
          const [x, y] = c.direction === 'x' ? [p, c.line] : [c.line, p];
          expect(x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1]).toBe(true);
        }
      }
    }
  });

  it('plan: bays sum to the length, one axis per frame and per column line', () => {
    const plan = drawings.plan;
    const bays = chain(plan, 'bays');
    expect(bays.segments).toHaveLength(layout.bayCount);
    bays.segments.forEach((s) => expect(s.value).toBeCloseTo(layout.bay, 2));
    expect(sum(bays)).toBeCloseTo(params.length, 3);
    expect(chain(plan, 'total').segments[0].value).toBeCloseTo(params.length, 3);
    expect(chain(plan, 'total').segments[0].text).toBe(`L = ${formatMetres(params.length)}`);
    const numbered = plan.axes.filter((a) => /^\d+$/.test(a.label));
    const lettered = plan.axes.filter((a) => /^[A-Z]$/.test(a.label));
    expect(numbered.map((a) => a.label)).toEqual(layout.frames.map((f) => String(f.index + 1)));
    expect(lettered.map((a) => a.label)).toEqual(['A', 'B']);
    expect(lettered[0].at).toBeLessThan(lettered[1].at);
    expect(numbered[0].at).toBe(0); // frame 1 at the front, y = 0
    expect(chain(plan, 'axes').segments[0].value).toBeCloseTo(2 * layout.halfWidths.columnAxis, 3);
    expect(chain(plan, 'outer').segments[0].value).toBeCloseTo(2 * layout.halfWidths.wallOuter, 3);
  });

  it('side elevations: bays sum to the length, one axis per frame', () => {
    for (const view of ['left', 'right'] as const) {
      const d = drawings[view];
      expect(sum(chain(d, 'bays'))).toBeCloseTo(params.length, 3);
      expect(chain(d, 'bays').segments).toHaveLength(layout.bayCount);
      expect(chain(d, 'total').segments[0].value).toBeCloseTo(params.length, 3);
      expect(d.axes).toHaveLength(layout.frames.length);
    }
    // From outside, frame 1 (the front) is on the left of the right elevation and on the right of the left one.
    const first = (v: 'left' | 'right') => drawings[v].axes.find((a) => a.label === '1')!.at;
    const last = (v: 'left' | 'right') => drawings[v].axes.find((a) => a.label === String(layout.frames.length))!.at;
    expect(first('right')).toBeLessThan(last('right'));
    expect(first('left')).toBeGreaterThan(last('left'));
  });

  it('end elevations: two column axes, A on the left of the front and on the right of the back', () => {
    const axes = (v: 'front' | 'back') => Object.fromEntries(drawings[v].axes.map((a) => [a.label, a.at]));
    expect(drawings.front.axes).toHaveLength(2);
    expect(axes('front').A).toBeLessThan(axes('front').B);
    expect(axes('back').A).toBeGreaterThan(axes('back').B);
    expect(chain(drawings.front, 'bays').segments[0].value).toBeCloseTo(2 * layout.halfWidths.columnAxis, 3);
    expect(chain(drawings.front, 'total').segments[0].value).toBeCloseTo(layout.walls.front.spanH, 3);
  });

  it('dimensions the clear eave height and the ridge / high eave like DimensionLines', () => {
    const topText = layout.roofType === 'mono' ? 'H max' : 'Coamă';
    for (const view of ['front', 'back', 'left', 'right', 'section'] as const) {
      const eave = chain(drawings[view], 'eave').segments[0];
      const top = chain(drawings[view], 'top').segments[0];
      expect(eave.value).toBeCloseTo(params.height, 3);
      expect(eave.text).toBe(`H = ${formatMetres(params.height)}`);
      expect(top.value).toBeCloseTo(layout.ridgeY, 3);
      expect(top.text).toBe(`${topText} = ${formatMetres(layout.ridgeY)}`);
    }
    expect(chain(drawings.section, 'clear').segments[0].text).toBe(`l = ${formatMetres(params.width)}`);
  });

  it('draws the wall outline from its polygon (pentagon on a gable, trapezoid on a mono end wall)', () => {
    const outline = drawings.front.polylines.find((p) => p.ref === 'wall')!;
    expect(outline.points).toHaveLength(layout.roofType === 'mono' ? 4 : 5);
    const apex = Math.max(...outline.points.map((p) => p[1]));
    expect(apex).toBeCloseTo(layout.walls.front.apexV, 3);
    // Mono: the high side of the front elevation is the world's high side (front: h runs +X).
    if (layout.highSide) {
      const highX = outline.points.find((p) => Math.abs(p[1] - apex) < 1e-6)![0];
      expect(highX > layout.walls.front.spanH / 2).toBe(layout.highSide === 'right');
    }
    expect(drawings.front.polylines.some((p) => p.layer === 'foundation')).toBe(params.foundation);
  });

  it('section shows the frame: two columns, the rafters and the purlins', () => {
    const s = drawings.section;
    expect(s.polylines.filter((p) => p.ref?.startsWith('column:'))).toHaveLength(2);
    expect(s.polylines.filter((p) => p.ref?.startsWith('rafter:'))).toHaveLength(layout.roofType === 'mono' ? 1 : 2);
    expect(s.polylines.filter((p) => p.ref?.startsWith('purlin:'))).toHaveLength(layout.purlins.length);
    expect(s.axes.map((a) => a.label).sort()).toEqual(['A', 'B']);
  });
});

describe('toWorld', () => {
  const layout = computeHallLayout(base);
  const drawings = buildDrawings(layout);

  it('maps the front-left eave corner of each elevation back to the world', () => {
    for (const view of ['front', 'back', 'left', 'right'] as const) {
      const wall = layout.walls[view];
      const d = drawings[view];
      // The sheet's left end at eave height, as seen from outside.
      const leftH = view === 'left' ? wall.spanH : 0;
      const expected = wallPointToWorld(wall, leftH, wall.spanV);
      close(drawingPointToWorld(d.toWorld, [0, wall.spanV]), expected);
      close(worldToDrawing(d.toWorld, expected), [0, wall.spanV]);
    }
    // Front elevation: (0, eave) is the front-left corner, at -X on the front face.
    const front = drawingPointToWorld(drawings.front.toWorld, [0, layout.walls.front.spanV]);
    close(front, [-layout.halfWidths.wallOuter, layout.walls.front.spanV, layout.walls.front.origin[2]]);
    // Left elevation: from outside its left end is the back of the hall.
    const left = drawingPointToWorld(drawings.left.toWorld, [0, 0]);
    expect(left[2]).toBeLessThan(-layout.params.length);
  });

  it('plan: front frame at y = 0, back frame at y = length; section through an interior frame', () => {
    close(drawingPointToWorld(drawings.plan.toWorld, [3, 12]), [3, 0, -12]);
    close(drawingPointToWorld(drawings.section.toWorld, [2, 4]), [2, 4, layout.frames[1].z]);
    expect(elevationFrame(layout.walls.left).axisX).toEqual([0, 0, 1]);
  });
});

describe('openings', () => {
  const layout = computeHallLayout({ ...base, length: 18 });
  const openings: DrawingOpening[] = [
    { id: 'w1', type: 'window', wallId: 'PereteSTG', offsetX: 1, sill: 1.2, width: 2, height: 1.5 },
    { id: 'g1', type: 'garageDoor', wallId: 'PereteFata', offsetX: 4, sill: 0, width: 4, height: 3.5 },
    { id: 'd1', type: 'door', wallId: 'PereteDR', offsetX: 2, sill: 0, width: 1, height: 2.1 },
  ];
  const drawings = buildDrawings(layout, openings);
  const rect = (d: Drawing, id: string) => d.polylines.find((p) => p.ref === `opening:${id}`);
  const xsOf = (d: Drawing, id: string) => rect(d, id)!.points.map((p) => p[0]);

  it('lands each opening on its own elevation only', () => {
    expect(rect(drawings.left, 'w1')).toBeDefined();
    expect(rect(drawings.front, 'g1')).toBeDefined();
    expect(rect(drawings.right, 'd1')).toBeDefined();
    expect(rect(drawings.back, 'w1') ?? rect(drawings.back, 'g1') ?? rect(drawings.back, 'd1')).toBeUndefined();
    expect(rect(drawings.left, 'd1')).toBeUndefined();
    for (const id of ['w1', 'g1', 'd1']) expect(rect(drawings.plan, id)).toBeDefined();
  });

  it('mirrors the left wall (its h runs right to left from outside); the others read as stored', () => {
    const spanH = layout.walls.left.spanH;
    expect(Math.min(...xsOf(drawings.left, 'w1'))).toBeCloseTo(spanH - 3, 3);
    expect(Math.max(...xsOf(drawings.left, 'w1'))).toBeCloseTo(spanH - 1, 3);
    expect(Math.min(...xsOf(drawings.front, 'g1'))).toBeCloseTo(4, 3);
    expect(Math.min(...xsOf(drawings.right, 'd1'))).toBeCloseTo(2, 3);
    // Near the front on the left wall = near the right end of its elevation, next to axis 1.
    const axis1 = drawings.left.axes.find((a) => a.label === '1')!.at;
    expect(Math.abs(Math.max(...xsOf(drawings.left, 'w1')) - axis1)).toBeLessThan(1.5);
  });

  it('labels width × height and dimensions positions and the window sill', () => {
    expect(drawings.left.labels.find((l) => l.ref === 'opening:w1')!.text).toBe('2 × 1,5 m');
    expect(drawings.front.labels.find((l) => l.ref === 'opening:g1')!.text).toBe('4 × 3,5 m');
    const edges = chain(drawings.front, 'openings');
    expect(edges.row).toBe(0);
    expect(edges.points).toEqual([0, 4, 8, roundMm(layout.walls.front.spanH)]);
    expect(edges.segments.map((s) => s.text).slice(0, 2)).toEqual(['4 m', '4 m']);
    expect(sum(edges)).toBeCloseTo(layout.walls.front.spanH, 3);
    expect(chain(drawings.front, 'bays').row).toBe(1);
    const sill = chain(drawings.left, 'sill:w1');
    expect(sill.segments[0].text).toBe('1,2 m');
    expect(drawings.front.dimensions.some((c) => c.id.startsWith('sill:'))).toBe(false);
    expect(buildDrawing(layout, 'back', openings).dimensions.find((c) => c.id === 'openings')).toBeUndefined();
  });
});
