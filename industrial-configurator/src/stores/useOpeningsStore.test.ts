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

describe('persist migration v0 -> v1', () => {
  it('converts normalised positions to metres and dedupes ids', async () => {
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
    expect(JSON.parse(localStorage.getItem(OPENINGS_STORAGE_KEY)!).version).toBe(OPENINGS_STORE_VERSION);
  });
});

describe('E7/E8: conflicts and re-clamping when the hall changes', () => {
  const span = (length: number, height: number, extra = {}) => ({ length, height, ...extra });
  const spans = (front: ReturnType<typeof span>) => ({ ...SPANS, PereteFata: front });

  const add = (mod: Awaited<ReturnType<typeof loadStore>>, o: Record<string, unknown>) =>
    mod.useOpeningsStore.getState().addOpening({
      type: 'window', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1, ...o,
    } as never);

  // table: [name, new front span, expected opening after the change, expected conflict count]
  const cases: Array<[string, ReturnType<typeof span>, Record<string, number>, number]> = [
    ['wall gets shorter: opening is pulled in', span(6, 3), { offsetX: 4, width: 2 }, 0],
    ['wall gets shorter than the opening: width shrinks', span(1.5, 3), { offsetX: 0, width: 1.5 }, 0],
    ['wall gets lower: sill follows', span(12, 2), { sill: 0.5, height: 1.5 }, 0],
    ['wall grows: nothing moves', span(20, 5), { offsetX: 8, width: 2, sill: 1 }, 0],
  ];

  it.each(cases)('%s', async (_name, next, expected, conflictCount) => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    const id = add(mod, { offsetX: 8, sill: 1, width: 2, height: 1.5 });
    useOpeningsStore.getState().setWallSpans(spans(next));
    const o = useOpeningsStore.getState().openings.find((x) => x.id === id)!;
    expect(o).toMatchObject(expected);
    expect(useOpeningsStore.getState().conflicts).toHaveLength(conflictCount);
  });

  it('flags openings that become overlapping after a shrink, and unflags them when fixed', async () => {
    const mod = await loadStore();
    const { useOpeningsStore } = mod;
    useOpeningsStore.getState().setWallSpans(spans(span(12, 3)));
    const a = add(mod, { offsetX: 1, width: 2 });
    const b = add(mod, { offsetX: 8, width: 2 });
    expect(useOpeningsStore.getState().conflicts).toHaveLength(0);
    useOpeningsStore.getState().setWallSpans(spans(span(3, 3)));
    const { conflicts } = useOpeningsStore.getState();
    expect(new Set(conflicts.map((c) => c.openingId))).toEqual(new Set([a, b]));
    expect(mod.selectHasOpeningConflicts(useOpeningsStore.getState())).toBe(true);
    useOpeningsStore.getState().removeOpening(b);
    expect(useOpeningsStore.getState().conflicts).toHaveLength(0);
  });

  it('does not re-clamp when the spans are unchanged (dragging keeps its position)', async () => {
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
