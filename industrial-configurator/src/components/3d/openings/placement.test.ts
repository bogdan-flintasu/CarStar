import { describe, expect, it } from 'vitest';
import { bandAt, endWallSegments, fitsAt, previewAt } from './placement';
import { spansFromHallState } from './wallSpans';
import type { Opening } from './types';

// 12 x 4 x 30 gable hall: side walls 30.42 m with five 6 m bays (centres 3.21, 9.21, ...), front gable 12.92 m.
const spans = spansFromHallState({ width: 12, height: 4, length: 30 });
const side = spans.PereteDR;
const gable = spans.PereteFata;
const mono = spansFromHallState({ width: 12, height: 4, length: 30, roofType: 'mono', highSide: 'left' });

const window1 = (o: Partial<Opening> = {}): Opening => ({
  id: 'w1', type: 'window', wallId: 'PereteDR', offsetX: 8.71, sill: 1, width: 1, height: 1, ...o,
});

describe('bay under the pointer', () => {
  it('picks the bay holding the pointer on a side wall', () => {
    expect(bandAt(1, side, 'PereteDR')).toEqual({ band: side.bays![0], bayIndex: 0 });
    expect(bandAt(13, side, 'PereteDR').bayIndex).toBe(2);
    expect(bandAt(30.4, side, 'PereteDR').bayIndex).toBe(4);
  });

  it('end walls are split at their columns, the whole wall when it only has corner columns', () => {
    const segments = endWallSegments(gable);
    expect(segments.map((s) => s.h1 - s.h0).reduce((a, b) => a + b)).toBeCloseTo(gable.length, 6);
    expect(bandAt(6, gable, 'PereteFata').bayIndex).toBeNull();
    expect(endWallSegments({ length: 10, height: 3 })).toEqual([{ h0: 0, h1: 10 }]);
  });
});

describe('previewAt: centring', () => {
  it('settles into the centre of the bay under the pointer on a side wall', () => {
    const p = previewAt({ type: 'door', wallId: 'PereteDR', h: 7.3, v: 1, span: side, others: [] });
    expect(p.bayIndex).toBe(1);
    expect(p.rect.offsetX + p.rect.width / 2).toBeCloseTo(9.21, 3);
    expect(p.rect.sill).toBe(0);
    expect(p.anchor).toEqual({ kind: 'bay', bay: 1, offset: 'centre' });
    expect(p.fits).toBe(true);
  });

  it('a window follows the pointer vertically on a 0.1 m grid', () => {
    const p = previewAt({ type: 'window', wallId: 'PereteDR', h: 15, v: 2.04, span: side, others: [] });
    expect(p.rect.sill).toBeCloseTo(1.5, 6);
  });

  it('on a gable it centres on the axis near it, else follows the pointer at 0.1 m', () => {
    const near = previewAt({ type: 'garageDoor', wallId: 'PereteFata', h: 6.46 + 0.25, v: 1, span: gable, others: [] });
    expect(near.anchor).toEqual({ kind: 'axis', fromCentre: 0 });
    const far = previewAt({ type: 'door', wallId: 'PereteFata', h: 3.04, v: 1, span: gable, others: [] });
    expect(far.rect.offsetX).toBeCloseTo(2.5, 6);
    expect(far.anchor.kind).toBe('axis');
  });

  it('free placement follows the pointer and anchors to the wall start', () => {
    const p = previewAt({ type: 'door', wallId: 'PereteDR', h: 7.33, v: 1, span: side, others: [], free: true });
    expect(p.rect.offsetX).toBeCloseTo(6.8, 6);
    expect(p.anchor).toEqual({ kind: 'wallStart', offsetX: 6.8 });
  });
});

describe('previewAt: does it fit?', () => {
  it('too wide for the bay', () => {
    const p = previewAt({ type: 'garageDoor', wallId: 'PereteDR', h: 9, v: 1, span: side, others: [], size: { width: 6.5, height: 3 } });
    expect(p).toMatchObject({ fits: false, reason: 'width' });
  });

  it('overlaps an opening already in the bay', () => {
    const p = previewAt({ type: 'window', wallId: 'PereteDR', h: 9, v: 1.5, span: side, others: [window1()] });
    expect(p).toMatchObject({ fits: false, reason: 'overlap' });
    // Another wall's opening does not matter.
    expect(previewAt({ type: 'window', wallId: 'PereteDR', h: 9, v: 1.5, span: side, others: [window1({ wallId: 'PereteSTG' })] }).fits).toBe(true);
  });

  it('crosses a column (free placement over a frame)', () => {
    const p = previewAt({ type: 'door', wallId: 'PereteDR', h: 6.2, v: 1, span: side, others: [], free: true });
    expect(p).toMatchObject({ fits: false, reason: 'column' });
  });

  it('under the mono-pitch slope', () => {
    // Front end wall of a mono hall: high (6.6 m) at h = 0, low (4.3 m) at the far end.
    const p = previewAt({ type: 'garageDoor', wallId: 'PereteFata', h: 11.5, v: 1, span: mono.PereteFata, others: [], size: { width: 2, height: 5 } });
    expect(p).toMatchObject({ fits: false, reason: 'slope' });
    const high = previewAt({ type: 'garageDoor', wallId: 'PereteFata', h: 2, v: 1, span: mono.PereteFata, others: [], size: { width: 2, height: 5 } });
    expect(high.fits).toBe(true);
  });

  it('fitsAt agrees with the store: a fitting preview gives an anchor that places exactly there', () => {
    const p = previewAt({ type: 'window', wallId: 'PereteDR', h: 20, v: 1.5, span: side, others: [] });
    expect(fitsAt('window', 'PereteDR', p.rect, side, []).fits).toBe(true);
  });
});
