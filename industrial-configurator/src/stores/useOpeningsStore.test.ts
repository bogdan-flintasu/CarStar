import { spansFromHallState } from '@/components/3d/openings/wallSpans';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal in-memory localStorage so zustand persist runs in node. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

async function loadStore(initial: Record<string, string> = {}) {
  vi.resetModules();
  const storage = memoryStorage(initial);
  // zustand persist reads `window.localStorage`; node has neither.
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  return import('./useOpeningsStore');
}

// Front wall of the default 12 x 3 x 12 hall, as the openings store derives it from D1's layout.
const DEFAULT_FRONT = spansFromHallState({ width: 12, height: 3, length: 12, showFoundation: true, isIsolated: false, insulation: 30 }).PereteFata;

const SPANS = {
  PereteFata: { length: 12, height: 3 },
  PereteSpate: { length: 12, height: 3 },
  PereteSTG: { length: 18, height: 3 },
  PereteDR: { length: 18, height: 3 },
};

describe('useOpeningsStore actions', () => {
  let mod: Awaited<ReturnType<typeof loadStore>>;
  beforeEach(async () => {
    mod = await loadStore();
    mod.useOpeningsStore.getState().setWallSpans(SPANS);
  });

  it('addOpening returns a unique id, selects it and clamps', () => {
    const { addOpening } = mod.useOpeningsStore.getState();
    const a = addOpening({ type: 'door', wallId: 'PereteFata', offsetX: 20, sill: 1, width: 1, height: 2.1 });
    const b = addOpening({ type: 'door', wallId: 'PereteFata', offsetX: 2, sill: 0, width: 1, height: 2.1 });
    const s = mod.useOpeningsStore.getState();
    expect(a).not.toBe(b);
    expect(s.selectedOpeningId).toBe(b);
    expect(s.openings.find((o) => o.id === a)).toMatchObject({ offsetX: 11, sill: 0 });
  });

  it('ids stay unique across a reload (E1)', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) {
      ids.add(mod.useOpeningsStore.getState().addOpening({
        type: 'window', wallId: 'PereteDR', offsetX: i * 2, sill: 1, width: 1, height: 1,
      }));
    }
    const saved = localStorage.getItem(mod.OPENINGS_STORAGE_KEY)!;
    const reloaded = await loadStore({ [mod.OPENINGS_STORAGE_KEY]: saved });
    expect(reloaded.useOpeningsStore.getState().openings).toHaveLength(3);
    ids.add(reloaded.useOpeningsStore.getState().addOpening({
      type: 'window', wallId: 'PereteDR', offsetX: 8, sill: 1, width: 1, height: 1,
    }));
    expect(ids.size).toBe(4);
    const all = reloaded.useOpeningsStore.getState().openings.map((o) => o.id);
    expect(new Set(all).size).toBe(4);
  });

  it('updateOpening keeps a door on the floor after a height change (E4)', () => {
    const { addOpening, updateOpening } = mod.useOpeningsStore.getState();
    const id = addOpening({ type: 'door', wallId: 'PereteSTG', offsetX: 4, sill: 0, width: 1, height: 2.1 });
    updateOpening(id, { height: 2.6 });
    updateOpening(id, { sill: 0.7 });
    expect(mod.useOpeningsStore.getState().openings[0]).toMatchObject({ height: 2.6, sill: 0 });
  });

  it('updateOpening re-clamps position after a width change (E4)', () => {
    const { addOpening, updateOpening } = mod.useOpeningsStore.getState();
    const id = addOpening({ type: 'window', wallId: 'PereteFata', offsetX: 10, sill: 1, width: 1, height: 1 });
    updateOpening(id, { width: 4 });
    expect(mod.useOpeningsStore.getState().openings[0]).toMatchObject({ width: 4, offsetX: 8 });
    updateOpening(id, { width: 50, height: 50 });
    expect(mod.useOpeningsStore.getState().openings[0]).toMatchObject({ width: 12, height: 3, offsetX: 0, sill: 0 });
  });

  it('removeOpening removes exactly one opening and clears selection', () => {
    const { addOpening, removeOpening } = mod.useOpeningsStore.getState();
    const a = addOpening({ type: 'window', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1 });
    const b = addOpening({ type: 'window', wallId: 'PereteFata', offsetX: 3, sill: 1, width: 1, height: 1 });
    removeOpening(b);
    const s = mod.useOpeningsStore.getState();
    expect(s.openings.map((o) => o.id)).toEqual([a]);
    expect(s.selectedOpeningId).toBeNull();
  });

  it('setOpenings accepts legacy shared-link data and repairs duplicate ids', () => {
    mod.useOpeningsStore.getState().setOpenings([
      { id: 'opening-1', type: 'window', wallId: 'PereteFata', posX: 0.5, posY: 0.5, width: 1, height: 1 },
      { id: 'opening-1', type: 'door', wallId: 'PereteFata', posX: 0.25, posY: 0.35, width: 1, height: 2.1 },
    ]);
    const [w, d] = mod.useOpeningsStore.getState().openings;
    expect(w.id).not.toBe(d.id);
    expect(w.offsetX).toBeCloseTo(DEFAULT_FRONT.length / 2 - 0.5, 3); // default hall 12 x 3
    expect(w.sill).toBeCloseTo(DEFAULT_FRONT.height / 2 - 0.5, 3);
    expect(d.sill).toBe(0);
  });
});

describe('persist migration to v2', () => {
  it('v0 -> v2: normalised positions become anchors, duplicate ids are repaired', async () => {
    const v0 = JSON.stringify({
      state: {
        openings: [
          { id: 'opening-1', type: 'window', wallId: 'PereteFata', posX: 0.5, posY: 0.5, width: 1, height: 1 },
          { id: 'opening-1', type: 'garageDoor', wallId: 'PereteSpate', posX: 0.5, posY: 0.5, width: 3, height: 3 },
          { id: 'opening-2', type: 'bogus', wallId: 'PereteFata', posX: 0.5, posY: 0.5, width: 1, height: 1 },
        ],
      },
      version: 0,
    });
    const { useOpeningsStore, OPENINGS_STORAGE_KEY, OPENINGS_STORE_VERSION } = await loadStore({
      'carstar-openings-storage': v0,
    });
    const openings = useOpeningsStore.getState().openings;
    expect(openings).toHaveLength(2);
    expect(new Set(openings.map((o) => o.id)).size).toBe(2);
    expect(openings[0]).toMatchObject({ width: 1, height: 1 });
    expect(openings[0].offsetX).toBeCloseTo(DEFAULT_FRONT.length / 2 - 0.5, 3);
    expect(openings[0].sill).toBeCloseTo(DEFAULT_FRONT.height / 2 - 0.5, 3);
    expect(openings[1]).toMatchObject({ type: 'garageDoor', sill: 0 });
    expect(openings[1].offsetX).toBeCloseTo(DEFAULT_FRONT.length / 2 - 1.5, 3);
    expect(openings[0]).not.toHaveProperty('posX');
    expect(useOpeningsStore.getState().intents.map((i) => i.anchor)).toEqual([
      { kind: 'axis', fromCentre: 0 },
      { kind: 'axis', fromCentre: 0 },
    ]);
    const saved = JSON.parse(localStorage.getItem(OPENINGS_STORAGE_KEY)!);
    expect(saved.version).toBe(OPENINGS_STORE_VERSION);
    expect(saved.state.intents).toHaveLength(2);
  });

  it('v1 -> v2: metres become anchors on the persisted hall (not the default one)', async () => {
    const v1 = JSON.stringify({
      state: { openings: [{ id: 'w', type: 'window', wallId: 'PereteDR', offsetX: 20, sill: 1, width: 1.2, height: 1 }] },
      version: 1,
    });
    const hall = JSON.stringify({ state: { width: 12, height: 4, length: 30 }, version: 1 });
    const { useOpeningsStore } = await loadStore({
      'carstar-openings-storage': v1,
      'carstar-configurator-storage': hall,
    });
    const [w] = useOpeningsStore.getState().intents;
    expect(w.anchor).toMatchObject({ kind: 'bay', bay: 3 });
    // Placed on the real hall, it is exactly where it was.
    useOpeningsStore.getState().setWallSpans(spansFromHallState({ width: 12, height: 4, length: 30 }));
    expect(useOpeningsStore.getState().openings[0]).toMatchObject({ offsetX: 20, sill: 1, width: 1.2, height: 1 });
  });

  it('v2: reloads the intents and drops malformed ones', async () => {
    const v2 = JSON.stringify({
      state: {
        intents: [
          { id: 'a', type: 'door', wallId: 'PereteSTG', anchor: { kind: 'bay', bay: 1, offset: 'centre' }, sill: 0, width: 1, height: 2.1 },
          { id: 'b', type: 'door', wallId: 'PereteSTG', anchor: { kind: 'bay', bay: 'x' }, sill: 0, width: 1, height: 2.1 },
        ],
      },
      version: 2,
    });
    const { useOpeningsStore } = await loadStore({ 'carstar-openings-storage': v2 });
    const s = useOpeningsStore.getState();
    expect(s.intents.map((i) => i.id)).toEqual(['a']);
    expect(s.openings[0]).toMatchObject({ id: 'a', anchor: { kind: 'bay', bay: 1, offset: 'centre' }, width: 1 });
  });
});

describe('setOpenings (shared links, models)', () => {
  it('accepts v0, v1 and v2 shapes', async () => {
    const mod = await loadStore();
    mod.useOpeningsStore.getState().setOpenings([
      { id: 'v0', type: 'window', wallId: 'PereteFata', posX: 0.5, posY: 0.5, width: 1, height: 1 },
      { id: 'v1', type: 'door', wallId: 'PereteDR', offsetX: 2, sill: 0, width: 1, height: 2.1 },
      { id: 'v2', type: 'window', wallId: 'PereteSTG', offsetX: 0, sill: 1, width: 1, height: 1, anchor: { kind: 'bay', bay: 1, offset: 'centre' } },
    ]);
    const s = mod.useOpeningsStore.getState();
    expect(s.intents.map((i) => i.anchor.kind)).toEqual(['axis', 'bay', 'bay']);
    expect(s.openings.find((o) => o.id === 'v1')!.offsetX).toBe(2);
    // v2: the anchor wins over stale metric fields.
    const v2 = s.openings.find((o) => o.id === 'v2')!;
    const bay = s.wallSpans!.PereteSTG.bays![1];
    expect(v2.offsetX + v2.width / 2).toBeCloseTo((bay.h0 + bay.h1) / 2, 3);
  });
});

describe('T1a: a change of the hall re-places openings from their anchors (E7/E8)', () => {
  const span = (length: number, height: number, extra = {}) => ({ length, height, ...extra });
  const spans = (front: ReturnType<typeof span>) => ({ ...SPANS, PereteFata: front });

  const add = (mod: Awaited<ReturnType<typeof loadStore>>, o: Record<string, unknown>) =>
    mod.useOpeningsStore.getState().addOpening({
      type: 'window', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1, ...o,
    } as never);

  // table: [name, new front span, expected opening after the change, expected conflict kinds]
  // The opening starts at offsetX 8 (centre 9: 3 m right of the 12 m wall's centre), 2 x 1.5 m, sill 1.
  const cases: Array<[string, ReturnType<typeof span>, Record<string, number>, string[]]> = [
    ['wall gets shorter: kept on the wall, flagged, never shrunk', span(6, 3), { offsetX: 4, width: 2 }, ['fit']],
    ['wall shorter than the opening: flagged, size kept', span(1.5, 3), { offsetX: 0, width: 2, height: 1.5 }, ['fit']],
    ['wall gets lower: flagged, sill and height kept', span(12, 2), { sill: 1, height: 1.5 }, ['fit']],
    ['wall grows: keeps its distance from the centre line', span(20, 5), { offsetX: 12, width: 2, sill: 1 }, []],
  ];

  it.each(cases)('%s', async (_name, next, expected, kinds) => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    const id = add(mod, { offsetX: 8, sill: 1, width: 2, height: 1.5 });
    const original = useOpeningsStore.getState().openings[0];
    useOpeningsStore.getState().setWallSpans(spans(next));
    const o = useOpeningsStore.getState().openings.find((x) => x.id === id)!;
    expect(o).toMatchObject(expected);
    expect(useOpeningsStore.getState().conflicts.map((c) => c.kind)).toEqual(kinds);
    // Back to the original wall: exactly where it was, nothing flagged.
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    expect(useOpeningsStore.getState().openings[0]).toEqual(original);
    expect(useOpeningsStore.getState().conflicts).toEqual([]);
  });

  it('flags openings that become overlapping after a shrink, and unflags them when fixed', async () => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    const a = add(mod, { offsetX: 1, width: 2 });
    const b = add(mod, { offsetX: 8, width: 2 });
    expect(useOpeningsStore.getState().conflicts).toHaveLength(0);
    useOpeningsStore.getState().setWallSpans(spans(span(3, 3)));
    const overlaps = () => useOpeningsStore.getState().conflicts.filter((c) => c.kind === 'overlap');
    expect(new Set(overlaps().map((c) => c.openingId))).toEqual(new Set([a, b]));
    expect(mod.selectHasOpeningConflicts(useOpeningsStore.getState())).toBe(true);
    useOpeningsStore.getState().removeOpening(b);
    expect(overlaps()).toHaveLength(0);
  });

  it('raises a notice when openings are moved or stop fitting, and clears it when they fit again', async () => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    const big = spansFromHallState({ width: 12, height: 4, length: 30 });
    useOpeningsStore.getState().setWallSpans(big);
    useOpeningsStore.getState().addOpening({ type: 'window', wallId: 'PereteDR', offsetX: 27, sill: 1, width: 1, height: 1 });
    useOpeningsStore.getState().addOpening({ type: 'window', wallId: 'PereteFata', offsetX: 11, sill: 1, width: 1, height: 1 });
    expect(useOpeningsStore.getState().relayoutNotice).toBeNull();
    useOpeningsStore.getState().setWallSpans(spansFromHallState({ width: 8, height: 4, length: 18 }));
    expect(useOpeningsStore.getState().relayoutNotice).toMatchObject({ moved: 1, unfit: 1 });
    useOpeningsStore.getState().setWallSpans(big);
    expect(useOpeningsStore.getState().relayoutNotice).toBeNull();
  });

  it('"Reașază automat" fixes an opening that no longer fits, at its size', async () => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    const id = add(mod, { offsetX: 8, sill: 1, width: 2, height: 1.5 });
    useOpeningsStore.getState().setWallSpans(spans(span(6, 3)));
    expect(useOpeningsStore.getState().conflicts).toHaveLength(1);
    expect(useOpeningsStore.getState().autoPlaceOpening(id)).toBe(true);
    expect(useOpeningsStore.getState().conflicts).toEqual([]);
    expect(useOpeningsStore.getState().openings[0]).toMatchObject({ width: 2, height: 1.5 });
  });

  it('a size edit keeps a centred opening centred', async () => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    const id = add(mod, { type: 'garageDoor', offsetX: 4.5, sill: 0, width: 3, height: 2.5 });
    useOpeningsStore.getState().updateOpening(id, { width: 4 });
    expect(useOpeningsStore.getState().openings[0]).toMatchObject({ offsetX: 4, width: 4 });
    expect(useOpeningsStore.getState().intents[0].anchor).toEqual({ kind: 'axis', fromCentre: 0 });
  });

  it('does not re-place when the spans are unchanged (dragging keeps its position)', async () => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    const before = useOpeningsStore.getState().openings;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    expect(useOpeningsStore.getState().openings).toBe(before);
  });

  it('flags an opening placed across a column', async () => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3, { supports: [6], supportHalfWidth: 0.1 })));
    const id = add(mod, { offsetX: 5.5 });
    expect(useOpeningsStore.getState().conflicts).toEqual([{ kind: 'support', openingId: id }]);
  });
});

describe('T1c: moving with or without snapping, centre buttons', () => {
  const big = spansFromHallState({ width: 12, height: 4, length: 30 });

  it('moveOpening anchors to a bay, or to the wall start when free (Alt / Aliniere off)', async () => {
    const mod = await loadStore();
    const s = mod.useOpeningsStore.getState;
    s().setWallSpans(big);
    const id = s().addOpening({ type: 'window', wallId: 'PereteDR', offsetX: 2, sill: 1, width: 1, height: 1 });
    s().moveOpening(id, { offsetX: 8.71, sill: 1.2 });
    expect(s().intents[0].anchor).toEqual({ kind: 'bay', bay: 1, offset: 'centre' });
    s().moveOpening(id, { offsetX: 8.5, sill: 1.2 }, { free: true });
    expect(s().intents[0].anchor).toEqual({ kind: 'wallStart', offsetX: 8.5 });
    // Clamped to the wall like every user edit.
    s().moveOpening(id, { offsetX: 99, sill: 1 }, { free: true });
    expect(s().openings[0].offsetX).toBeCloseTo(big.PereteDR.length - 1, 3);
  });

  it('"Centrează în travee" and "Centrează pe perete"', async () => {
    const mod = await loadStore();
    const s = mod.useOpeningsStore.getState;
    s().setWallSpans(big);
    const side = s().addOpening({ type: 'door', wallId: 'PereteDR', offsetX: 13, sill: 0, width: 1, height: 2.1 });
    const end = s().addOpening({ type: 'door', wallId: 'PereteFata', offsetX: 1, sill: 0, width: 1, height: 2.1 });
    const anchorOf = (id: string) => s().intents.find((o) => o.id === id)!.anchor;

    expect(s().centreOpening(side, 'bay')).toBe(true);
    expect(anchorOf(side)).toEqual({ kind: 'bay', bay: 2, offset: 'centre' });
    expect(s().centreOpening(end, 'bay')).toBe(false);
    expect(s().centreOpening(end, 'wall')).toBe(true);
    expect(anchorOf(end)).toEqual({ kind: 'axis', fromCentre: 0 });
    const placed = s().openings.find((o) => o.id === end)!;
    expect(placed.offsetX + placed.width / 2).toBeCloseTo(big.PereteFata.length / 2, 3);
  });

  it('snapping is on by default and its switch is not persisted', async () => {
    const mod = await loadStore();
    const s = mod.useOpeningsStore.getState;
    expect(s().snapEnabled).toBe(true);
    s().setSnapEnabled(false);
    s().addOpening({ type: 'window', wallId: 'PereteDR', offsetX: 2, sill: 1, width: 1, height: 1 });
    expect(localStorage.getItem(mod.OPENINGS_STORAGE_KEY)).not.toContain('snapEnabled');
  });
});
