import { describe, expect, it } from 'vitest';
import { baysOf, placeAll } from './anchors';
import { nextFreeSpot, freeSpot, clipboardOf, COPY_GAP } from './copyPaste';
import { planRepeat } from './repeat';
import { isTypingTarget, isMacPlatform, shortcutFor, type ShortcutKey } from './shortcuts';
import type { OpeningIntent, WallSpans } from './types';
import { spansFromHallState } from './wallSpans';

const SPANS: WallSpans = spansFromHallState({ width: 12, height: 4, length: 30 });
const SIDE = SPANS.PereteDR;
const BAYS = baysOf(SIDE);

const win = (id: string, bay: number, extra: Partial<OpeningIntent> = {}): OpeningIntent => ({
  id,
  type: 'window',
  wallId: 'PereteDR',
  anchor: { kind: 'bay', bay, offset: 'centre' },
  sill: 1.2,
  width: 1.2,
  height: 1,
  ...extra,
});

const placed = (intents: OpeningIntent[]) => placeAll(intents, SPANS).openings;

describe('nextFreeSpot (side walls)', () => {
  it('has several bays to work with', () => {
    expect(BAYS.length).toBeGreaterThanOrEqual(4);
  });

  it('takes the next bay with the same offset, size and sill', () => {
    const src = win('a', 1, { anchor: { kind: 'bay', bay: 1, offset: 0.8 } });
    const all = placed([src]);
    const spot = nextFreeSpot(clipboardOf(src), 'PereteDR', all[0], all, SIDE);
    expect(spot).toMatchObject({ type: 'window', wallId: 'PereteDR', anchor: { kind: 'bay', bay: 2, offset: 0.8 }, sill: 1.2, width: 1.2, height: 1 });
  });

  it('skips taken bays and wraps to the front', () => {
    const last = BAYS.length - 1;
    const intents = [win('a', last - 1), win('b', last)];
    const all = placed(intents);
    const spot = nextFreeSpot(clipboardOf(intents[0]), 'PereteDR', all[0], all, SIDE);
    expect(spot?.anchor).toEqual({ kind: 'bay', bay: 0, offset: 'centre' });
  });

  it('returns null when every bay is taken', () => {
    const intents = BAYS.map((_, i) => win(`w${i}`, i));
    const all = placed(intents);
    expect(nextFreeSpot(clipboardOf(intents[0]), 'PereteDR', all[0], all, SIDE)).toBeNull();
  });

  it('returns null when the item is too wide for any bay', () => {
    const src = win('a', 0, { width: 20 });
    const all = placed([src]);
    expect(nextFreeSpot(clipboardOf(src), 'PereteDR', all[0], all, SIDE)).toBeNull();
  });
});

describe('nextFreeSpot (end walls)', () => {
  const FRONT = SPANS.PereteFata;
  const door = (fromCentre: number): OpeningIntent => ({
    id: 'd',
    type: 'door',
    wallId: 'PereteFata',
    anchor: { kind: 'axis', fromCentre },
    sill: 0,
    width: 1,
    height: 2.1,
  });

  it('goes to the right of the reference, clear of it and of the columns', () => {
    const src = door(0);
    const all = placed([src]);
    const spot = nextFreeSpot(clipboardOf(src), 'PereteFata', all[0], all, FRONT)!;
    expect(spot.anchor.kind).toBe('axis');
    const fromCentre = (spot.anchor as { fromCentre: number }).fromCentre;
    expect(fromCentre).toBeGreaterThanOrEqual(1 + COPY_GAP - 1e-6);
    expect(freeSpot(spot, all, FRONT)).not.toBeNull();
  });

  it('wraps to the wall start when the right side is full', () => {
    const src = door(FRONT.length / 2 - 0.6);
    const all = placed([src]);
    const spot = nextFreeSpot(clipboardOf(src), 'PereteFata', all[0], all, FRONT)!;
    expect((spot.anchor as { fromCentre: number }).fromCentre).toBeLessThan(0);
  });

  it('returns null when nothing fits on the wall', () => {
    const src = { ...door(0), width: FRONT.length + 1 };
    const all = placed([src]);
    expect(nextFreeSpot(clipboardOf(src), 'PereteFata', all[0], all, FRONT)).toBeNull();
  });
});

describe('planRepeat', () => {
  it('every bay: one copy per other bay, centred', () => {
    const src = win('a', 1);
    const all = placed([src]);
    const plan = planRepeat(src, all[0], { kind: 'every' }, all, SIDE)!;
    expect(plan.add).toHaveLength(BAYS.length - 1);
    expect(plan.skipped).toBe(0);
    expect(plan.add.map((a) => (a.anchor as { bay: number }).bay)).not.toContain(1);
    expect(plan.add.every((a) => (a.anchor as { offset: unknown }).offset === 'centre')).toBe(true);
  });

  it('every second bay counts from the item', () => {
    const src = win('a', 1);
    const all = placed([src]);
    const plan = planRepeat(src, all[0], { kind: 'everySecond' }, all, SIDE)!;
    const bays = plan.add.map((a) => (a.anchor as { bay: number }).bay);
    expect(bays.every((b) => (b - 1) % 2 === 0)).toBe(true);
    expect(bays).toHaveLength(BAYS.filter((_, i) => i !== 1 && Math.abs(i - 1) % 2 === 0).length);
  });

  it('skips bays that are taken and counts them', () => {
    const src = win('a', 0);
    const other = win('b', 2);
    const all = placed([src, other]);
    const plan = planRepeat(src, all[0], { kind: 'every' }, all, SIDE)!;
    expect(plan.skipped).toBe(1);
    expect(plan.add).toHaveLength(BAYS.length - 2);
  });

  it('N even: N items in all, evenly spaced, the item moves to its nearest slot', () => {
    const src = win('a', 0, { width: 0.6 });
    const all = placed([src]);
    const n = 3;
    const plan = planRepeat(src, all[0], { kind: 'count', n }, all, SIDE)!;
    expect(plan.add.length + plan.skipped + (plan.move ? 1 : 0)).toBe(n);
  });

  it('N even: a slot across a column is skipped and the item stays', () => {
    const src = win('a', 0, { width: 1 });
    const all = placed([src]);
    const mid = SIDE.length / 2;
    const onColumn = (SIDE.supports ?? []).some((h) => Math.abs(h - mid) < 0.5 + (SIDE.supportHalfWidth ?? 0));
    const plan = planRepeat(src, all[0], { kind: 'count', n: 1 }, all, SIDE)!;
    expect(plan.add).toHaveLength(0);
    if (onColumn) {
      expect(plan.move).toBeUndefined();
      expect(plan.skipped).toBe(1);
    } else {
      expect(plan.move).toBeDefined();
    }
  });

  it('is null on end walls', () => {
    const src: OpeningIntent = { ...win('a', 0), wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: 0 } };
    const all = placed([src]);
    expect(planRepeat(src, all[0], { kind: 'every' }, all, SPANS.PereteFata)).toBeNull();
  });
});

describe('shortcutFor', () => {
  const key = (k: string, extra: Partial<ShortcutKey> = {}): ShortcutKey => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...extra,
  });
  const ctx = { isMac: true, hasSelection: true, hasClipboard: true, textSelected: false };

  it('uses ⌘ on a Mac and Ctrl elsewhere', () => {
    expect(shortcutFor(key('c', { metaKey: true }), ctx)).toBe('copy');
    expect(shortcutFor(key('c', { ctrlKey: true }), ctx)).toBeNull();
    expect(shortcutFor(key('d', { ctrlKey: true }), { ...ctx, isMac: false })).toBe('duplicate');
    expect(shortcutFor(key('v', { metaKey: true }), { ...ctx, isMac: false })).toBeNull();
  });

  it('ignores typing targets', () => {
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
      expect(isTypingTarget(target as unknown as EventTarget)).toBe(true);
      expect(shortcutFor(key('c', { metaKey: true, target: target as unknown as EventTarget }), ctx)).toBeNull();
    }
    expect(isTypingTarget({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
  });

  it('needs a selection for copy/duplicate and a copy for paste', () => {
    const none = { ...ctx, hasSelection: false, hasClipboard: false };
    expect(shortcutFor(key('c', { metaKey: true }), none)).toBeNull();
    expect(shortcutFor(key('d', { metaKey: true }), none)).toBeNull();
    expect(shortcutFor(key('v', { metaKey: true }), none)).toBeNull();
    expect(shortcutFor(key('V', { metaKey: true }), ctx)).toBe('paste');
  });

  it('leaves copy to the browser while text is selected; ignores Shift/Alt', () => {
    expect(shortcutFor(key('c', { metaKey: true }), { ...ctx, textSelected: true })).toBeNull();
    expect(shortcutFor(key('c', { metaKey: true, shiftKey: true }), ctx)).toBeNull();
    expect(shortcutFor(key('c', { metaKey: true, altKey: true }), ctx)).toBeNull();
  });

  it('detects a Mac', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32', userAgent: 'Windows NT' })).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});
