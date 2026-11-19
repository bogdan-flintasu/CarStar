import { describe, expect, it } from 'vitest';
import {
  anchorFromRect,
  autoPlace,
  baysOf,
  intentFromRect,
  normalizeIntents,
  parseAnchor,
  placeAll,
  placeOpening,
} from './anchors';
import { validateOpenings } from './validateOpenings';
import { spansFromHallState, type HallState } from './wallSpans';
import type { OpeningIntent, OpeningRect, WallId, WallSpans } from './types';

const hall = (o: Partial<HallState> = {}): WallSpans => spansFromHallState({ width: 12, height: 4, length: 30, ...o });

let n = 0;
const intent = (o: Partial<OpeningIntent> & Pick<OpeningIntent, 'anchor' | 'wallId'>): OpeningIntent => ({
  id: `o${++n}`,
  type: 'window',
  sill: 1,
  width: 1.2,
  height: 1,
  ...o,
});

const rectOf = (i: OpeningIntent, spans: WallSpans) => placeOpening(i, spans[i.wallId]).rect;
const unfitIds = (spans: WallSpans, list: OpeningIntent[]) => {
  const { status } = placeAll(list, spans);
  return Object.keys(status).filter((id) => !status[id].fits);
};

describe('placeOpening / anchorFromRect', () => {
  const spans = hall();
  const side = spans.PereteDR;
  const bays = baysOf(side);

  it('a real side wall has one bay per frame spacing, front to back', () => {
    expect(bays).toHaveLength(5);
    expect(bays[1].h0).toBeCloseTo(bays[0].h1, 9);
    expect(bays[0].h1 - bays[0].h0).toBeCloseTo(6, 6);
  });

  it('round-trips a rectangle through its anchor on a side wall', () => {
    const rect: OpeningRect = { offsetX: 13.4, sill: 1.1, width: 1.5, height: 1.2 };
    const anchor = anchorFromRect(rect, side, 'side');
    expect(anchor).toEqual({ kind: 'bay', bay: 2, offset: expect.closeTo(13.4 - bays[2].h0, 6) });
    const back = placeOpening({ type: 'window', anchor, sill: rect.sill, width: rect.width, height: rect.height }, side);
    expect(back).toEqual({ rect, fits: true });
  });

  it('round-trips an anchor through its rectangle', () => {
    for (const anchor of [
      { kind: 'bay', bay: 3, offset: 2.25 },
      { kind: 'bay', bay: 0, offset: 'centre' },
    ] as const) {
      const p = placeOpening({ type: 'door', anchor, sill: 0, width: 1, height: 2.1 }, side);
      expect(anchorFromRect(p.rect, side, 'side')).toEqual(anchor);
    }
    const gable = spans.PereteFata;
    const axis = { kind: 'axis', fromCentre: -2.5 } as const;
    const p = placeOpening({ type: 'window', anchor: axis, sill: 1, width: 1, height: 1 }, gable);
    expect(anchorFromRect(p.rect, gable, 'end')).toEqual(axis);
  });

  it("detects 'centre' within 1 cm of the bay centre", () => {
    const c = (bays[1].h0 + bays[1].h1) / 2;
    const at = (left: number) => anchorFromRect({ offsetX: left, sill: 1, width: 2, height: 1 }, side, 'side');
    expect(at(c - 1 + 0.008)).toEqual({ kind: 'bay', bay: 1, offset: 'centre' });
    expect(at(c - 1 - 0.009)).toEqual({ kind: 'bay', bay: 1, offset: 'centre' });
    expect(at(c - 1 + 0.02)).toEqual({ kind: 'bay', bay: 1, offset: expect.closeTo(c - 1 + 0.02 - bays[1].h0, 6) });
  });

  it('free placement anchors to the wall start', () => {
    const rect = { offsetX: 7.3, sill: 0, width: 1, height: 2.1 };
    const anchor = anchorFromRect(rect, side, 'side', { free: true });
    expect(anchor).toEqual({ kind: 'wallStart', offsetX: 7.3 });
    expect(placeOpening({ type: 'door', anchor, sill: 0, width: 1, height: 2.1 }, side)).toEqual({ rect, fits: true });
    // On a shorter wall it is placed as close as possible and does not fit; the anchor is untouched.
    const short = hall({ length: 12 }).PereteDR;
    const far = placeOpening({ type: 'door', anchor: { kind: 'wallStart', offsetX: 20 }, sill: 0, width: 1, height: 2.1 }, short);
    expect(far.fits).toBe(false);
    expect(far.rect.offsetX + far.rect.width).toBeLessThanOrEqual(short.length);
  });
});

describe('a change of the hall', () => {
  const big = hall({ length: 30, width: 15 });
  const small = hall({ length: 18, width: 9 });

  it('shrinking then growing back restores every opening exactly (side walls and gables)', () => {
    const rects: Array<[WallId, OpeningRect]> = [
      ['PereteDR', { offsetX: 19.6, sill: 1.1, width: 1.2, height: 1 }],
      ['PereteSTG', { offsetX: 25.0, sill: 0, width: 1, height: 2.1 }],
      ['PereteSTG', { offsetX: 3.4, sill: 1.2, width: 2, height: 1 }],
      ['PereteFata', { offsetX: 5.5, sill: 0, width: 4, height: 4 }],
      ['PereteSpate', { offsetX: 1.2, sill: 1, width: 1, height: 1 }],
    ];
    const intents = rects.map(([wallId, r], i) =>
      intentFromRect({ id: `k${i}`, type: r.sill === 0 ? 'door' : 'window', wallId }, r, big[wallId]),
    );
    const before = placeAll(intents, big).openings;
    expect(before.map((o) => o.offsetX)).toEqual(rects.map(([, r]) => r.offsetX));

    const shrunk = placeAll(intents, small);
    expect(shrunk.openings.map((o) => o.offsetX)).not.toEqual(rects.map(([, r]) => r.offsetX));
    expect(placeAll(intents, big).openings).toEqual(before);
  });

  it('an opening whose bay is gone moves to the nearest free bay', () => {
    const lost = intent({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 4, offset: 'centre' } });
    const inBay2 = intent({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 2, offset: 'centre' } });
    const shorter = hall({ length: 18 }); // 3 bays
    const { openings, status } = placeAll([lost, inBay2], shorter);
    expect(status[lost.id]).toEqual({ fits: true, moved: true });
    // Bay 2 (the nearest) is taken at the same height, so it lands in bay 1.
    const bays = baysOf(shorter.PereteDR);
    const placed = openings.find((o) => o.id === lost.id)!;
    expect(placed.offsetX + placed.width / 2).toBeCloseTo((bays[1].h0 + bays[1].h1) / 2, 2);
    expect(placed.anchor).toEqual(lost.anchor); // the intent is kept
    expect(validateOpenings(openings, shorter)).toEqual([]);
  });

  it("with no free bay the opening does not fit ('fit' conflict)", () => {
    const shorter = hall({ length: 12 }); // 2 bays
    const list = [
      intent({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 0, offset: 'centre' } }),
      intent({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 1, offset: 'centre' } }),
      intent({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 4, offset: 'centre' } }),
    ];
    const { openings, status } = placeAll(list, shorter);
    expect(status[list[2].id]).toEqual({ fits: false, moved: false });
    const unfit = unfitIds(shorter, list);
    expect(validateOpenings(openings, shorter, unfit).filter((c) => c.kind === 'fit')).toEqual([
      { kind: 'fit', openingId: list[2].id },
    ]);
  });

  it('keeps a bay offset when the bay changes size, and gets it back', () => {
    const w = intent({ wallId: 'PereteSTG', anchor: { kind: 'bay', bay: 1, offset: 4.2 } });
    const at = (length: number) => rectOf(w, hall({ length }));
    const original = at(30);
    expect(at(28).offsetX).toBeCloseTo(baysOf(hall({ length: 28 }).PereteSTG)[1].h0 + 4.2, 3);
    expect(at(30)).toEqual(original);
  });

  it('gable: a centred garage door stays centred across width changes', () => {
    const door = intent({ type: 'garageDoor', wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: 0 }, sill: 0, width: 4, height: 3.5 });
    for (const width of [8, 12, 15, 20]) {
      const spans = hall({ width });
      const r = rectOf(door, spans);
      expect(r.offsetX + r.width / 2).toBeCloseTo(spans.PereteFata.length / 2, 3);
      expect(r.width).toBe(4);
    }
  });

  it('gable: an off-axis opening keeps its distance from the axis', () => {
    const win = intent({ wallId: 'PereteSpate', anchor: { kind: 'axis', fromCentre: -3 } });
    for (const width of [10, 14, 20]) {
      const spans = hall({ width });
      const r = rectOf(win, spans);
      expect(r.offsetX + r.width / 2 - spans.PereteSpate.length / 2).toBeCloseTo(-3, 3);
    }
  });

  it('gable: an opening pushed off a narrower wall is flagged, not shrunk', () => {
    const win = intent({ wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: 5.5 }, width: 2 });
    const spans = hall({ width: 8 });
    const p = placeOpening(win, spans.PereteFata);
    expect(p.fits).toBe(false);
    expect(p.rect.width).toBe(2);
    expect(p.rect.offsetX + p.rect.width).toBeLessThanOrEqual(spans.PereteFata.length);
  });
});

describe('mono-pitch end walls', () => {
  const mono = (height: number) => hall({ roofType: 'mono', highSide: 'right', height });

  it('an opening under the low side that no longer fits is flagged, not shrunk; "Reașază automat" finds a spot', () => {
    const tall = mono(5).PereteFata;
    // A window whose top is just under the low eave of a 5 m hall, near the low (left) end.
    const win = intentFromRect(
      { id: 'm', type: 'window', wallId: 'PereteFata' },
      { offsetX: 1, sill: tall.height - 1.3, width: 1.2, height: 1.2 },
      tall,
    );
    expect(placeOpening(win, tall).fits).toBe(true);

    const low = mono(4);
    const p = placeOpening(win, low.PereteFata);
    expect(p.fits).toBe(false);
    expect(p.rect).toMatchObject({ width: 1.2, height: 1.2, sill: win.sill });

    const fixed = autoPlace(win, [win], low)!;
    expect(fixed).not.toBeNull();
    expect(fixed).toMatchObject({ width: 1.2, height: 1.2, sill: win.sill, wallId: 'PereteFata' });
    const placed = placeAll([fixed], low);
    expect(placed.status.m.fits).toBe(true);
    expect(validateOpenings(placed.openings, low)).toEqual([]);
  });

  it('"Reașază automat" moves an overlapping opening next to its neighbour on the same wall', () => {
    const spans = hall();
    const a = intent({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 2, offset: 'centre' } });
    const b = intent({ wallId: 'PereteDR', anchor: { kind: 'bay', bay: 2, offset: 'centre' } });
    const fixed = autoPlace(b, [a, b], spans)!;
    expect(fixed.wallId).toBe('PereteDR');
    expect(fixed).toMatchObject({ width: b.width, height: b.height });
    const { openings } = placeAll([a, fixed], spans);
    expect(validateOpenings(openings, spans)).toEqual([]);
  });

  it('shrinks only as a last resort', () => {
    const spans = hall({ width: 8, height: 3 });
    // Taller than every wall of this hall: no wall takes it at its size.
    const huge = intent({ type: 'garageDoor', wallId: 'PereteFata', anchor: { kind: 'axis', fromCentre: 0 }, sill: 0, width: 4, height: 6 });
    const fixed = autoPlace(huge, [huge], spans)!;
    expect(fixed.height).toBeLessThan(6);
    expect(placeAll([fixed], spans).status[huge.id].fits).toBe(true);
  });
});

describe('untrusted input', () => {
  const spans = hall();
  const ids = () => {
    let i = 0;
    return () => `new${++i}`;
  };

  it('parses v0, v1 and v2 shapes into anchors', () => {
    const list = normalizeIntents(
      [
        { id: 'v0', type: 'window', wallId: 'PereteFata', posX: 0.5, posY: 0.5, width: 1, height: 1 },
        { id: 'v1', type: 'door', wallId: 'PereteDR', offsetX: 20, sill: 0, width: 1, height: 2.1 },
        { id: 'v2', type: 'window', wallId: 'PereteSTG', offsetX: 99, sill: 1, width: 1, height: 1, anchor: { kind: 'bay', bay: 3, offset: 'centre' } },
        { id: 'v2b', type: 'window', wallId: 'PereteFata', sill: 1, width: 1, height: 1, anchor: { kind: 'wallStart', offsetX: 2 } },
      ],
      spans,
      ids(),
    );
    expect(list.map((i) => i.anchor)).toEqual([
      { kind: 'axis', fromCentre: 0 },
      { kind: 'bay', bay: 3, offset: expect.closeTo(20 - baysOf(spans.PereteDR)[3].h0, 6) },
      { kind: 'bay', bay: 3, offset: 'centre' },
      { kind: 'wallStart', offsetX: 2 },
    ]);
    expect(list[0]).not.toHaveProperty('posX');
  });

  it('falls back to the metric fields when the anchor is malformed or does not suit the wall', () => {
    const list = normalizeIntents(
      [
        { id: 'a', type: 'window', wallId: 'PereteFata', offsetX: 2, sill: 1, width: 1, height: 1, anchor: { kind: 'bay', bay: 1, offset: 1 } },
        { id: 'b', type: 'window', wallId: 'PereteDR', offsetX: 2, sill: 1, width: 1, height: 1, anchor: { kind: 'bay', bay: -1, offset: 1 } },
        { id: 'c', type: 'window', wallId: 'PereteDR', sill: 1, width: 1, height: 1, anchor: { kind: 'nope' } },
      ],
      spans,
      ids(),
    );
    expect(list.map((i) => [i.id, i.anchor.kind])).toEqual([
      ['a', 'axis'],
      ['b', 'bay'],
    ]);
  });

  it('parseAnchor accepts only the three kinds, strictly', () => {
    expect(parseAnchor({ kind: 'axis', fromCentre: 1, extra: 1 })).toEqual({ kind: 'axis', fromCentre: 1 });
    expect(parseAnchor({ kind: 'bay', bay: 1.5, offset: 0 })).toBeNull();
    expect(parseAnchor({ kind: 'bay', bay: 1, offset: 'middle' })).toBeNull();
    expect(parseAnchor({ kind: 'wallStart', offsetX: -1 })).toBeNull();
    expect(parseAnchor({ kind: 'axis', fromCentre: Infinity })).toBeNull();
    expect(parseAnchor(null)).toBeNull();
  });
});
