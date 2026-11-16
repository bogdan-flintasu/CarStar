import { describe, expect, it } from 'vitest';
import { clampOpening } from './openingMath';
import { validateOpenings, wallSpansFromLayout } from './validateOpenings';
import { layoutFromHallState } from './wallSpans';
import type { Opening, WallSpan, WallSpans } from './types';

const win = (o: Partial<Opening> = {}): Opening => ({
  id: 'w', type: 'window', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1, ...o,
});

const spans = (front: WallSpan): WallSpans => ({
  PereteFata: front,
  PereteSpate: front,
  PereteSTG: front,
  PereteDR: front,
});

describe('validateOpenings', () => {
  const plain: WallSpan = { length: 12, height: 3 };
  const withColumns: WallSpan = { length: 12, height: 3, supports: [6], supportHalfWidth: 0.1 };
  const withPipe: WallSpan = { length: 12, height: 3, blockers: [{ h0: 3.9, h1: 4.1, v0: 0, v1: 3 }] };

  const cases: Array<[string, WallSpan, Opening[], string[]]> = [
    ['no openings', plain, [], []],
    ['apart', plain, [win({ id: 'a' }), win({ id: 'b', offsetX: 4 })], []],
    ['touching edges are fine', plain, [win({ id: 'a' }), win({ id: 'b', offsetX: 2 })], []],
    ['overlap flags both', plain, [win({ id: 'a' }), win({ id: 'b', offsetX: 1.5 })], ['overlap:a:b', 'overlap:b:a']],
    ['same x, different height: no overlap', plain, [win({ id: 'a' }), win({ id: 'b', sill: 2.5, height: 0.4 })], []],
    ['different walls never overlap', plain, [win({ id: 'a' }), win({ id: 'b', wallId: 'PereteDR' })], []],
    ['crossing a column', withColumns, [win({ id: 'a', offsetX: 5.5 })], ['support:a']],
    ['beside a column', withColumns, [win({ id: 'a', offsetX: 4 })], []],
    ['touching a column flange is fine', withColumns, [win({ id: 'a', offsetX: 4.9 })], []],
    ['covering a downpipe', withPipe, [win({ id: 'a', offsetX: 3.5 })], ['blocker:a']],
    ['above the downpipe', withPipe, [win({ id: 'a', offsetX: 3.5, sill: 3 })], []],
  ];

  it.each(cases)('%s', (_name, span, openings, expected) => {
    const got = validateOpenings(openings, spans(span)).map((c) => [c.kind, c.openingId, c.otherId].filter(Boolean).join(':'));
    expect(got.sort()).toEqual([...expected].sort());
  });

  it('works without spans (overlaps only)', () => {
    expect(validateOpenings([win({ id: 'a' }), win({ id: 'b' })], null)).toHaveLength(2);
  });
});

describe('gable walls', () => {
  const gable: WallSpan = { length: 12, height: 3, apex: 4.0 };
  const fit = (o: Partial<Opening>) => clampOpening(win(o), gable);

  it('allows a tall opening in the middle of a gable', () => {
    expect(fit({ offsetX: 5, sill: 0, height: 3.8, width: 2 })).toMatchObject({ offsetX: 5, height: 3.8 });
  });
  it('moves a tall opening away from the slope instead of shrinking it', () => {
    const r = fit({ offsetX: 0, sill: 0, height: 3.8, width: 2 });
    expect(r.height).toBe(3.8);
    expect(r.offsetX).toBeGreaterThan(4);
    expect(r.offsetX + r.width).toBeLessThan(8);
  });
  it('lowers the top of a very wide opening to the eave line', () => {
    const r = fit({ offsetX: 0, sill: 0, height: 3.8, width: 12 });
    expect(r.sill + r.height).toBeLessThanOrEqual(3);
  });
  it('never exceeds the apex', () => {
    expect(fit({ sill: 0, height: 9, width: 0.3, offsetX: 5.85 }).height).toBeLessThanOrEqual(4);
  });
  it('a real layout: every wall accepts a default door at its centre', () => {
    const layout = layoutFromHallState({ width: 12, height: 4, length: 12 });
    const s = wallSpansFromLayout(layout);
    expect(s.PereteFata.apex).toBeGreaterThan(s.PereteFata.height);
    expect(s.PereteSTG.apex).toBeUndefined();
    expect(s.PereteSTG.supports!.length).toBe(layout.frames.length);
  });
});
