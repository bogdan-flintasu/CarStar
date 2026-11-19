import { describe, expect, it } from 'vitest';
import { centreInBayAnchor, centreOnWallAnchor, snap, SNAP_DISTANCE, type SnapNeighbour } from './snapping';
import { anchorFromRect } from './anchors';
import { previewAt } from './placement';
import { spansFromHallState } from './wallSpans';
import type { OpeningRect, WallSpan } from './types';

// Side wall of a 12 x 4 x 30 hall: 30.42 m, bays of 6 m centred at 3.21, 9.21, 15.21, 21.21, 27.21; middle 15.21.
const spans = spansFromHallState({ width: 12, height: 4, length: 30 });
const side = spans.PereteDR;
const gable = spans.PereteFata; // 12.92 m, middle 6.46

/** A plain wall without bays, so only the targets under test are near. */
const plain: WallSpan = { length: 40, height: 5 };

const win = (offsetX: number, sill = 1, width = 1): SnapNeighbour => ({ type: 'window', offsetX, sill, width, height: 1 });
const rect = (offsetX: number, sill = 1, width = 1): OpeningRect => ({ offsetX, sill, width, height: 1 });
const sideOpts = { type: 'window' as const, wallKind: 'side' as const };
const endOpts = { type: 'window' as const, wallKind: 'end' as const };

describe('snap: bay centre', () => {
  it('pulls the item onto the centre of its bay within 0.30 m, with a guide', () => {
    const r = snap(rect(8.71 + 0.25), side, [], sideOpts);
    expect(r.rect.offsetX).toBeCloseTo(8.71, 6);
    expect(r.guides).toEqual([{ kind: 'bayCentre', h: expect.closeTo(9.21, 6) }]);
    expect(r.free).toBe(false);
  });

  it('leaves it alone just beyond the threshold', () => {
    const r = snap(rect(8.71 + SNAP_DISTANCE + 0.02), side, [], sideOpts);
    expect(r.rect.offsetX).toBeCloseTo(8.71 + SNAP_DISTANCE + 0.02, 6);
    expect(r.guides).toEqual([]);
  });

  it('a centred result anchors as { kind: bay, offset: centre }', () => {
    const r = snap(rect(14.71 - 0.1), side, [], sideOpts);
    expect(anchorFromRect(r.rect, side, 'side')).toEqual({ kind: 'bay', bay: 2, offset: 'centre' });
  });
});

describe('snap: wall middle', () => {
  it('end walls snap onto the axis (wall middle)', () => {
    const r = snap(rect(5.96 + 0.2), gable, [], endOpts);
    expect(r.rect.offsetX).toBeCloseTo(5.96, 6);
    expect(r.guides).toEqual([{ kind: 'wallCentre', h: expect.closeTo(6.46, 6) }]);
  });

  it('never pulls an item onto a column (middle of a side wall with an even number of bays)', () => {
    const even = spansFromHallState({ width: 12, height: 4, length: 12 }).PereteDR; // 2 bays: a frame in the middle
    const mid = even.length / 2;
    const r = snap(rect(mid - 0.5 + 0.2), even, [], { ...sideOpts, type: 'door' });
    expect(r.guides).toEqual([]);
    expect(r.rect.offsetX).toBeCloseTo(mid - 0.3, 6);
  });

  it('prefers the nearer target', () => {
    // Plain 40 m wall: middle 20, an equal-gap spot at left 19.7 (neighbours [17,18] and [22.4,23.4]).
    // Candidate left 19.4: the middle (left 19.5) is 0.1 away, the equal gap 0.3 away.
    const r = snap(rect(19.4), plain, [win(17), win(22.4)], { ...endOpts, type: 'door' });
    expect(r.guides.map((g) => g.kind)).toEqual(['wallCentre']);
    const r2 = snap(rect(19.75), plain, [win(17), win(22.4)], { ...endOpts, type: 'door' });
    expect(r2.guides.map((g) => g.kind)).toEqual(['equalGap']);
  });
});

describe('snap: equal gaps', () => {
  it('between two neighbours', () => {
    // Neighbours [2,3] and [9,10]; a 1 m item centred in the free 6 m: left = 5.5.
    const r = snap(rect(5.7), plain, [win(2), win(9)], { ...sideOpts, type: 'door' });
    expect(r.rect.offsetX).toBeCloseTo(5.5, 6);
    expect(r.guides).toEqual([{ kind: 'equalGap', v: 1.5, gaps: [{ h0: 3, h1: 5.5 }, { h0: 6.5, h1: 9 }] }]);
  });

  it('repeating the gap of the neighbouring pair', () => {
    // [2,3] and [5,6]: gap 2 -> the next one at left = 8.
    const r = snap(rect(8.2, 3), plain, [win(2), win(5)], sideOpts);
    expect(r.rect.offsetX).toBeCloseTo(8, 6);
    expect(r.guides[0]).toMatchObject({ kind: 'equalGap', gaps: [{ h0: 3, h1: 5 }, { h0: 6, h1: 8 }] });
  });

  it('on the other side too', () => {
    // [30,31] and [33,34]: gap 2 -> the previous one at left = 27.
    const r = snap(rect(26.85, 3), plain, [win(30), win(33)], sideOpts);
    expect(r.rect.offsetX).toBeCloseTo(27, 6);
  });
});

describe('snap: window sills', () => {
  it('a window takes the sill of another window on the wall within 0.30 m, with a horizontal guide', () => {
    const r = snap(rect(30, 1.25), plain, [win(25, 1.0)], sideOpts);
    expect(r.rect.sill).toBe(1.0);
    expect(r.guides).toContainEqual({ kind: 'sill', v: 1.0, h0: 25, h1: 31 });
  });

  it('not beyond the threshold, and never for doors or from doors', () => {
    expect(snap(rect(30, 1.35), plain, [win(25, 1.0)], sideOpts).rect.sill).toBe(1.35);
    expect(snap(rect(30, 1.1), plain, [win(25, 1.0)], { ...sideOpts, type: 'door' }).rect.sill).toBe(1.1);
    const door: SnapNeighbour = { type: 'door', offsetX: 25, sill: 1.0, width: 1, height: 2.1 };
    expect(snap(rect(30, 1.1), plain, [door], sideOpts).rect.sill).toBe(1.1);
  });
});

describe('snap: Alt / free', () => {
  it('returns the candidate untouched and free, which anchors to the wall start', () => {
    const c = rect(8.71 + 0.1);
    const r = snap(c, side, [win(2)], { ...sideOpts, free: true });
    expect(r).toEqual({ rect: c, guides: [], free: true });
    expect(anchorFromRect(r.rect, side, 'side', { free: r.free })).toEqual({ kind: 'wallStart', offsetX: 8.81 });
  });

  it('the placement preview snaps the sill to a neighbour window, and not when free', () => {
    const others = [{ id: 'a', type: 'window' as const, wallId: 'PereteDR' as const, offsetX: 2.71, sill: 1.2, width: 1, height: 1 }];
    const snapped = previewAt({ type: 'window', wallId: 'PereteDR', h: 9.2, v: 1.6, span: side, others });
    expect(snapped.rect.sill).toBe(1.2);
    expect(snapped.guides.map((g) => g.kind)).toEqual(['bayCentre', 'sill']);
    const free = previewAt({ type: 'window', wallId: 'PereteDR', h: 9.2, v: 1.6, span: side, others, free: true });
    expect(free.rect.sill).toBeCloseTo(1.1, 6);
    expect(free.guides).toEqual([]);
  });
});

describe('centre buttons', () => {
  it('"Centrează în travee" gives { kind: bay, offset: centre } for the bay holding the item (side walls only)', () => {
    expect(centreInBayAnchor(rect(13), side, 'PereteDR')).toEqual({ kind: 'bay', bay: 2, offset: 'centre' });
    expect(centreInBayAnchor(rect(3), gable, 'PereteFata')).toBeNull();
  });

  it('"Centrează pe perete" gives { kind: axis, fromCentre: 0 } on end walls, the wall middle on side walls', () => {
    expect(centreOnWallAnchor(rect(1), gable, 'PereteFata')).toEqual({ kind: 'axis', fromCentre: 0 });
    // The middle of this side wall is the centre of bay 2.
    expect(centreOnWallAnchor(rect(1), side, 'PereteDR')).toEqual({ kind: 'bay', bay: 2, offset: 'centre' });
  });
});
