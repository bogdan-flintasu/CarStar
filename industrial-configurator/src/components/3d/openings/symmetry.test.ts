import { describe, expect, it } from 'vitest';
import { isOnAxis, mirrorTo, mirrorWall, pairMode, snapsToAxis, syncTwin, twinFor, twinOf } from './symmetry';
import { spansFromHallState } from './wallSpans';
import type { OpeningIntent } from './types';

const spans = spansFromHallState({ width: 12, height: 4, length: 30 });
const win = (o: Partial<OpeningIntent>): OpeningIntent => ({
  id: 'a',
  type: 'window',
  wallId: 'PereteSTG',
  anchor: { kind: 'bay', bay: 2, offset: 'centre' },
  sill: 1.2,
  width: 1.5,
  height: 1,
  ...o,
});

describe('mirror walls and modes', () => {
  it('maps each mode to its opposite wall', () => {
    expect(mirrorWall('PereteSTG', 'leftRight')).toBe('PereteDR');
    expect(mirrorWall('PereteDR', 'leftRight')).toBe('PereteSTG');
    expect(mirrorWall('PereteFata', 'frontBack')).toBe('PereteSpate');
    expect(mirrorWall('PereteFata', 'leftRight')).toBeNull();
    expect(mirrorWall('PereteSTG', 'frontBack')).toBeNull();
    expect(mirrorWall('PereteSpate', 'wallAxis')).toBe('PereteSpate');
    expect(mirrorWall('PereteDR', 'wallAxis')).toBeNull();
    expect(mirrorWall('PereteDR', 'none')).toBeNull();
  });
  it('infers the pair mode from two walls', () => {
    expect(pairMode('PereteSTG', 'PereteDR')).toBe('leftRight');
    expect(pairMode('PereteSpate', 'PereteFata')).toBe('frontBack');
    expect(pairMode('PereteFata', 'PereteFata')).toBe('wallAxis');
    expect(pairMode('PereteSTG', 'PereteSTG')).toBeNull();
    expect(pairMode('PereteSTG', 'PereteFata')).toBeNull();
  });
});

describe('mirror mapping', () => {
  it('Stânga↔Dreapta keeps the bay index and offset from the front', () => {
    const t = twinFor(win({ anchor: { kind: 'bay', bay: 3, offset: 0.4 } }), 'leftRight', spans)!;
    expect(t).toMatchObject({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 3, offset: 0.4 }, sill: 1.2, width: 1.5, height: 1 });
  });
  it('Față↔Spate flips the sign of fromCentre', () => {
    const t = twinFor(win({ wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: -2 } }), 'frontBack', spans)!;
    expect(t).toMatchObject({ wallId: 'PereteSpate', anchor: { kind: 'axis', fromCentre: 2 } });
  });
  it('Pe axa peretelui mirrors about the axis; an item on the axis has no twin', () => {
    const t = twinFor(win({ wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: -3 } }), 'wallAxis', spans)!;
    expect(t).toMatchObject({ wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: 3 } });
    expect(twinFor(win({ wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: 0 } }), 'wallAxis', spans)).toBeNull();
  });
  it('a wall-start anchor is mirrored from the other end', () => {
    const L = spans.PereteFata.length;
    const t = mirrorTo(win({ wallId: 'PereteFata', anchor: { kind: 'wallStart', offsetX: 1 } }), 'PereteSpate', spans.PereteSpate)!;
    expect(t.anchor).toEqual({ kind: 'wallStart', offsetX: Math.round((L - 1 - 1.5) * 1000) / 1000 });
    expect(isOnAxis({ kind: 'wallStart', offsetX: L / 2 - 0.75 }, 1.5, L)).toBe(true);
  });
  it('a garage door snaps to the axis only in Pe axa peretelui on a gable', () => {
    expect(snapsToAxis('garageDoor', 'PereteFata', 'wallAxis')).toBe(true);
    expect(snapsToAxis('garageDoor', 'PereteSTG', 'wallAxis')).toBe(false);
    expect(snapsToAxis('door', 'PereteFata', 'wallAxis')).toBe(false);
    expect(snapsToAxis('garageDoor', 'PereteFata', 'frontBack')).toBe(false);
  });
});

describe('syncTwin', () => {
  const a = win({ id: 'a', linkId: 'L', anchor: { kind: 'bay', bay: 4, offset: 'centre' }, width: 2 });
  const b = win({ id: 'b', linkId: 'L', wallId: 'PereteDR' });
  it('finds the twin and makes it follow (mirrored)', () => {
    expect(twinOf([a, b], 'a')?.id).toBe('b');
    const next = syncTwin([a, b], 'a', spans);
    expect(next.find((o) => o.id === 'b')).toMatchObject({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 4 }, width: 2, linkId: 'L' });
  });
  it('unlinks both when the item left the pair of walls', () => {
    const moved = { ...a, wallId: 'PereteFata' as const, anchor: { kind: 'axis' as const, fromCentre: 1 } };
    const next = syncTwin([moved, b], 'a', spans);
    expect(next.every((o) => o.linkId === undefined)).toBe(true);
  });
});
