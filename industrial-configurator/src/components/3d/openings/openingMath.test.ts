import { describe, expect, it } from 'vitest';
import { clampOpening, legacyToOpening, MIN_OPENING_SIZE, normalizeOpenings, resizeOpening } from './openingMath';
import { getWallSpans } from './wallSpans';
import type { Opening, WallSpan } from './types';

const wall: WallSpan = { length: 12, height: 4 };
const win = (o: Partial<Opening> = {}): Opening => ({
  id: 'w', type: 'window', wallId: 'PereteFata', offsetX: 2, sill: 1, width: 1, height: 1, ...o,
});
const door = (o: Partial<Opening> = {}): Opening => win({ id: 'd', type: 'door', sill: 0, height: 2.1, ...o });

describe('clampOpening', () => {
  it('leaves a valid opening untouched', () => {
    expect(clampOpening(win(), wall)).toEqual(win());
  });

  it('keeps doors and industrial doors on the floor', () => {
    expect(clampOpening(door({ sill: 1.5 }), wall).sill).toBe(0);
    expect(clampOpening(win({ type: 'garageDoor', sill: 2 }), wall).sill).toBe(0);
    expect(clampOpening(door({ sill: 1.5 })).sill).toBe(0);
  });

  it('keeps the opening inside the wall horizontally', () => {
    expect(clampOpening(win({ offsetX: -3 }), wall).offsetX).toBe(0);
    expect(clampOpening(win({ offsetX: 11.8, width: 1 }), wall).offsetX).toBe(11);
  });

  it('keeps windows inside the wall vertically', () => {
    expect(clampOpening(win({ sill: -1 }), wall).sill).toBe(0);
    expect(clampOpening(win({ sill: 3.5, height: 1 }), wall).sill).toBe(3);
  });

  it('limits size to the wall and to the minimum', () => {
    const big = clampOpening(win({ width: 20, height: 10 }), wall);
    expect(big).toMatchObject({ width: 12, height: 4, offsetX: 0, sill: 0 });
    const tiny = clampOpening(win({ width: 0.05, height: -1 }), wall);
    expect(tiny.width).toBe(MIN_OPENING_SIZE);
    expect(tiny.height).toBe(MIN_OPENING_SIZE);
  });

  it('replaces non-finite numbers with safe values', () => {
    const o = clampOpening(win({ offsetX: NaN, sill: Infinity, width: NaN }), wall);
    expect(Number.isFinite(o.offsetX) && Number.isFinite(o.sill) && Number.isFinite(o.width)).toBe(true);
  });

  it('is idempotent', () => {
    const once = clampOpening(win({ offsetX: 50, sill: 9, width: 3.3333 }), wall);
    expect(clampOpening(once, wall)).toEqual(once);
  });
});

describe('resizeOpening', () => {
  it('right handle grows to the right and keeps the left edge', () => {
    const r = resizeOpening(win(), 'tr', 0.5, 0, wall);
    expect(r.offsetX).toBe(2);
    expect(r.width).toBeCloseTo(1.5);
  });

  it('left handle grows to the left and keeps the right edge', () => {
    const r = resizeOpening(win(), 'tl', -0.5, 0, wall);
    expect(r.offsetX).toBeCloseTo(1.5);
    expect(r.offsetX + r.width).toBeCloseTo(3);
  });

  it('bottom handle on a window keeps the top edge', () => {
    const r = resizeOpening(win(), 'bl', 0, -0.4, wall);
    expect(r.sill).toBeCloseTo(0.6);
    expect(r.sill + r.height).toBeCloseTo(2);
  });

  it('bottom handle on a door changes width only; door stays on the floor', () => {
    const r = resizeOpening(door(), 'br', 0.2, 1, wall);
    expect(r).toMatchObject({ sill: 0, height: 2.1, offsetX: 2 });
    expect(r.width).toBeCloseTo(1.2);
  });

  it('stops at the wall edges and at the minimum size', () => {
    expect(resizeOpening(win(), 'tl', -10, 0, wall)).toMatchObject({ offsetX: 0, width: 3 });
    expect(resizeOpening(win(), 'tr', 50, 50, wall)).toMatchObject({ offsetX: 2, width: 10, height: 3 });
    const shrunk = resizeOpening(win(), 'tl', 5, 0, wall);
    expect(shrunk.width).toBe(MIN_OPENING_SIZE);
    expect(shrunk.offsetX + shrunk.width).toBeCloseTo(3);
  });
});

describe('legacy migration', () => {
  it('converts a normalised centre to metres', () => {
    const o = legacyToOpening(
      { id: 'a', type: 'window', wallId: 'PereteFata', posX: 0.5, posY: 0.5, width: 1, height: 1 },
      wall,
    );
    expect(o).toEqual({ id: 'a', type: 'window', wallId: 'PereteFata', offsetX: 5.5, sill: 1.5, width: 1, height: 1 });
  });

  it('normalizeOpenings drops junk, accepts both shapes and dedupes ids', () => {
    let n = 0;
    const spans = getWallSpans(12, 4, 12);
    const out = normalizeOpenings(
      [
        { id: 'opening-1', type: 'door', wallId: 'PereteSTG', posX: 0.5, posY: 0.26, width: 1, height: 2.1 },
        { id: 'opening-1', type: 'window', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1 },
        { id: 'x', type: 'skylight', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1 },
        { id: 'y', type: 'window', wallId: 'Roof', offsetX: 1, sill: 1, width: 1, height: 1 },
        { id: 'z', type: 'window', wallId: 'PereteDR', width: 1, height: 1 },
        null,
        'opening',
      ],
      spans,
      () => `new-${++n}`,
    );
    expect(out.map((o) => o.id)).toEqual(['opening-1', 'new-1']);
    expect(out[0]).toMatchObject({ offsetX: 5.5, sill: 0 });
    expect(normalizeOpenings('nope', spans, () => 'x')).toEqual([]);
  });
});
