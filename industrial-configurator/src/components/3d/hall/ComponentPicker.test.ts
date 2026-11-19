import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { computeHallLayout, type HallLayout, type HallParams, type Vec3 } from '@/lib/hall';
import { DEFAULT_PALETTE, defaultColors } from '@/lib/colors';
import { placeKit } from './placements';
import { KIT_PIECES } from './kit';
import {
  componentColor,
  highlightTarget,
  instanceKeys,
  isClickGesture,
  parseKey,
  pickFromHits,
  refKey,
  resolveKey,
  resolvePick,
  type PickedComponent,
} from './ComponentPicker.map';

const base = { foundation: true, panels: true, insulationMm: 100 } as const;
const HALLS: [string, HallParams][] = [
  ['12x12x4 gable', { ...base, width: 12, length: 12, height: 4 }],
  ['40x15x5 gable', { ...base, width: 15, length: 40, height: 5 }],
  ['30x15x5 mono', { ...base, width: 15, length: 30, height: 5, roofType: 'mono', highSide: 'right' }],
];

const ORIGIN: Vec3 = [0, 0, 0];
const pick = (layout: HallLayout, objectName: string, instanceId?: number, point: Vec3 = ORIGIN) =>
  resolvePick({ objectName, instanceId, point }, layout);
const position = (layout: HallLayout, name: 'Column' | 'Rafter' | 'Purlin' | 'Downpipe' | 'Gutter', id: number) =>
  new Vector3().setFromMatrixPosition(placeKit(layout)[name][id].matrix);

describe.each(HALLS)('resolvePick on a %s hall', (_name, params) => {
  const layout = computeHallLayout(params);
  const placements = placeKit(layout);

  it('has an instance table exactly as long as placeKit, for every mapped piece (the order contract)', () => {
    for (const piece of KIT_PIECES) {
      const keys = instanceKeys(layout, piece);
      if (keys) expect(keys, piece).toHaveLength(placements[piece].length);
    }
  });

  it('maps every Column instance to a distinct (side, frame), as many as layout.columns', () => {
    const picks = placements.Column.map((_, id) => pick(layout, 'Column', id)!);
    expect(picks).toHaveLength(layout.columns.length);
    expect(new Set(picks.map((p) => p.key)).size).toBe(layout.columns.length);
    picks.forEach((p, id) => {
      if (p.kind !== 'column') throw new Error('not a column');
      const at = position(layout, 'Column', id);
      const column = layout.columns.find((c) => c.side === p.side && c.frame === p.frame)!;
      expect(at.x).toBeCloseTo(column.x, 6);
      expect(at.z).toBeCloseTo(column.z, 6);
      expect(p.height).toBeCloseTo(column.height, 9);
      expect(p.colorComponent).toBe('steel');
    });
  });

  it('maps rafters to their side and frame', () => {
    placements.Rafter.forEach((_, id) => {
      const p = pick(layout, 'Rafter', id)!;
      if (p.kind !== 'rafter') throw new Error('not a rafter');
      const at = position(layout, 'Rafter', id);
      const frame = layout.frames[p.frame];
      expect(at.z).toBeCloseTo(frame.z, 6);
      // The rafter starts at its side's eave joint (mono: the low side).
      expect(Math.sign(at.x)).toBe(p.side === 'left' ? -1 : 1);
      expect(p.length).toBeCloseTo(layout.rafterLength, 9);
    });
    expect(new Set(placements.Rafter.map((_, id) => pick(layout, 'Rafter', id)!.key)).size).toBe(layout.rafters.length);
  });

  it('maps purlin spans to their side, line and bay', () => {
    placements.Purlin.forEach((placement, id) => {
      const p = pick(layout, 'Purlin', id)!;
      if (p.kind !== 'purlin') throw new Error('not a purlin');
      const line = layout.purlins.find((l) => l.side === p.side && l.index === p.line)!;
      const at = position(layout, 'Purlin', id);
      expect(at.x).toBeCloseTo(line.x, 6);
      expect(at.y).toBeCloseTo(line.y, 6);
      // A span is stretched along z: its length is the scale, its middle lies inside bay `p.bay`.
      const stretch = new Vector3().setFromMatrixScale(placement.matrix).z;
      expect(p.length).toBeCloseTo(stretch, 6);
      const front = p.bay === 0 ? line.zFrom : layout.frames[p.bay].z;
      const back = p.bay === layout.bayCount - 1 ? line.zTo : layout.frames[p.bay + 1].z;
      expect(Math.min(front, back) <= at.z && at.z <= Math.max(front, back)).toBe(true);
    });
    expect(new Set(placements.Purlin.map((_, id) => pick(layout, 'Purlin', id)!.key)).size).toBe(placements.Purlin.length);
  });

  it('maps gutter spans to the gutter on their side and downpipes to their side and end', () => {
    placements.Gutter.forEach((_, id) => {
      const p = pick(layout, 'Gutter', id)!;
      if (p.kind !== 'gutter') throw new Error('not a gutter');
      expect(Math.sign(position(layout, 'Gutter', id).x)).toBe(p.side === 'left' ? -1 : 1);
      expect(p.colorComponent).toBe('trims');
    });
    expect(new Set(placements.Gutter.map((_, id) => pick(layout, 'Gutter', id)!.key)).size).toBe(layout.gutters.length);
    placements.Downpipe.forEach((_, id) => {
      const p = pick(layout, 'Downpipe', id)!;
      if (p.kind !== 'downpipe') throw new Error('not a downpipe');
      const pipe = layout.downpipes.find((d) => d.side === p.side && d.end === p.end)!;
      expect(position(layout, 'Downpipe', id).z).toBeCloseTo(pipe.z, 6);
      expect(p.height).toBeCloseTo(pipe.topY - pipe.bottomY, 9);
    });
  });

  it('maps small parts to their member and leaves bolts, joints, cleats and flashings unpickable', () => {
    expect(pick(layout, 'BasePlate', 3)!.key).toBe(pick(layout, 'Column', 3)!.key);
    expect(pick(layout, 'GirtCleat', 0)!.key).toBe(pick(layout, 'Column', 0)!.key);
    expect(pick(layout, 'DownpipeShoe', 1)!.key).toBe(pick(layout, 'Downpipe', 1)!.key);
    expect(pick(layout, 'GutterEndCap', 0)!.kind).toBe('gutter');
    for (const name of ['Bolt', 'RidgeJoint', 'PurlinCleat', 'RidgeCap', 'Trims', 'EaveFlashing', 'Slab', 'Ground', '']) {
      expect(pick(layout, name, 0), name).toBeNull();
    }
    expect(pick(layout, 'Column')).toBeNull(); // no instance id
    expect(pick(layout, 'Column', placements.Column.length)).toBeNull(); // past the end
  });

  it('maps a wall hit to its wall, with its area', () => {
    for (const wall of Object.values(layout.walls)) {
      const p = pick(layout, wall.id)!;
      if (p.kind !== 'wallPanel') throw new Error('not a wall');
      expect(p.wall).toBe(wall.key);
      expect(p.area).toBeCloseTo(wall.area, 9);
      expect(p.height).toBeCloseTo(wall.apexV, 9);
      expect(p.colorComponent).toBe('walls');
      expect(p.details.some((d) => d.value.endsWith(' m²'))).toBe(true);
    }
  });

  it('picks the roof slope under the hit point', () => {
    const left = pick(layout, 'Roof', undefined, [-3, layout.ridgeY, -1])!;
    const right = pick(layout, 'Roof', undefined, [3, layout.ridgeY, -1])!;
    if (left.kind !== 'roofPanel' || right.kind !== 'roofPanel') throw new Error('not a roof');
    if (layout.roofType === 'gable') {
      expect([left.side, right.side]).toEqual(['left', 'right']);
    } else {
      expect(left.side).toBe(layout.roof[0].side);
      expect(right.side).toBe(layout.roof[0].side);
    }
    expect(left.area).toBeCloseTo(layout.roof.find((r) => r.side === left.side)!.area, 9);
    expect(left.pitchDeg).toBeCloseTo(10, 6);
  });

  it('round-trips every key and re-reads it in the same layout', () => {
    const picks = [
      ...placements.Column.map((_, id) => pick(layout, 'Column', id)!),
      ...placements.Rafter.map((_, id) => pick(layout, 'Rafter', id)!),
      ...placements.Purlin.map((_, id) => pick(layout, 'Purlin', id)!),
      ...placements.Gutter.map((_, id) => pick(layout, 'Gutter', id)!),
      ...placements.Downpipe.map((_, id) => pick(layout, 'Downpipe', id)!),
      ...Object.values(layout.walls).map((w) => pick(layout, w.id)!),
      ...layout.roof.map((r) => pick(layout, 'Roof', undefined, [r.eave[0], 0, 0])!),
    ];
    for (const p of picks) {
      expect(refKey(parseKey(p.key)!)).toBe(p.key);
      expect(resolveKey(p.key, layout)).toEqual(p);
      expect(highlightTarget(p, layout), p.key).not.toBeNull();
    }
  });
});

describe('highlightTarget', () => {
  const layout = computeHallLayout(HALLS[1][1]);
  const placements = placeKit(layout);

  it('gives the instance and its matrix for an instanced piece; a column picked by its base plate lights the column', () => {
    const target = highlightTarget(pick(layout, 'BasePlate', 5)!, layout)!;
    expect(target.type).toBe('instances');
    if (target.type !== 'instances') return;
    expect(target.objectName).toBe('Column');
    expect(target.instances).toEqual([{ instanceId: 5, matrix: placements.Column[5].matrix }]);
  });

  it('lights every span of a gutter line', () => {
    const target = highlightTarget(pick(layout, 'Gutter', 0)!, layout)!;
    if (target.type !== 'instances') throw new Error('expected instances');
    expect(target.instances.length).toBe(placements.Gutter.length / layout.gutters.length);
  });

  it('gives a wall its world outline and a roof slope its top surface', () => {
    const wall = highlightTarget(pick(layout, 'PereteFata')!, layout)!;
    if (wall.type !== 'face') throw new Error('expected a face');
    expect(wall.polygon).toHaveLength(layout.walls.front.polygon.length);
    for (const [, , z] of wall.polygon) expect(z).toBeCloseTo(layout.walls.front.origin[2], 9);
    const roof = highlightTarget(pick(layout, 'Roof', undefined, [-2, 0, 0])!, layout)!;
    if (roof.type !== 'face') throw new Error('expected a face');
    expect(roof.polygon).toHaveLength(4);
    expect(roof.normal[0]).toBeLessThan(0); // the left slope faces left and up
    expect(roof.normal[1]).toBeGreaterThan(0.9);
  });

  it('returns null for an element the layout no longer has', () => {
    const big = computeHallLayout(HALLS[1][1]);
    const small = computeHallLayout(HALLS[0][1]);
    const lastColumn = pick(big, 'Column', placeKit(big).Column.length - 1)!;
    expect(resolveKey(lastColumn.key, small)).toBeNull();
    expect(highlightTarget(lastColumn, small)).toBeNull();
    expect(resolveKey('nonsense', small)).toBeNull();
    expect(resolveKey('gutter:right', computeHallLayout(HALLS[2][1]))).toBeNull(); // mono-pitch high side: no gutter
  });
});

describe('pickFromHits (click priority)', () => {
  const layout = computeHallLayout(HALLS[0][1]);
  const wall = { objectName: 'PereteFata', point: ORIGIN };

  it('lets an opening in front of a wall win', () => {
    expect(pickFromHits([{ objectName: '', point: ORIGIN, opening: true, helper: true }, wall], layout)).toEqual({ kind: 'opening' });
  });

  it('picks the wall when the opening is behind it', () => {
    const outcome = pickFromHits([wall, { objectName: '', point: ORIGIN, opening: true }], layout);
    expect(outcome.kind).toBe('component');
  });

  it('skips helpers (dimension lines, sky) and treats unpickable surfaces and no hit as empty space', () => {
    const outcome = pickFromHits([{ objectName: 'Sky', point: ORIGIN, helper: true }, { objectName: 'Column', instanceId: 0, point: ORIGIN }], layout);
    expect(outcome.kind === 'component' && outcome.picked.kind).toBe('column');
    expect(pickFromHits([{ objectName: 'Bolt', instanceId: 0, point: ORIGIN }, wall], layout)).toEqual({ kind: 'empty' });
    expect(pickFromHits([{ objectName: 'Ground', point: ORIGIN }], layout)).toEqual({ kind: 'empty' });
    expect(pickFromHits([], layout)).toEqual({ kind: 'empty' });
  });
});

describe('gestures and colour', () => {
  it('tells a click from an orbit drag or a pinch', () => {
    expect(isClickGesture({ x: 10, y: 10 }, { x: 13, y: 13 }, 'mouse')).toBe(true);
    expect(isClickGesture({ x: 10, y: 10 }, { x: 20, y: 10 }, 'mouse')).toBe(false);
    expect(isClickGesture({ x: 10, y: 10 }, { x: 17, y: 10 }, 'touch')).toBe(true);
    expect(isClickGesture({ x: 10, y: 10 }, { x: 10, y: 10 }, 'touch', { multiTouch: true })).toBe(false);
  });

  it('reads the colour name and RAL of the picked component', () => {
    const layout = computeHallLayout(HALLS[0][1]);
    const column = pick(layout, 'Column', 0) as PickedComponent;
    expect(componentColor(column, defaultColors(), DEFAULT_PALETTE)).toEqual({ name: 'Gri deschis', ral: '7035', hex: '#cbd0cc' });
    const roof = pick(layout, 'Roof', undefined, [1, 0, 0]) as PickedComponent;
    expect(componentColor(roof, defaultColors(), DEFAULT_PALETTE).ral).toBe('7016');
  });

  it('labels in Romanian with formatted sizes', () => {
    const layout = computeHallLayout(HALLS[0][1]);
    const column = pick(layout, 'Column', 5)!;
    expect(column.label).toBe('Stâlp');
    expect(column.details[0]).toEqual({ label: 'Poziție', value: 'Ax 3, dreapta' });
    expect(column.details[1].value).toMatch(/^\d+(,\d{1,2})? m$/);
  });
});
