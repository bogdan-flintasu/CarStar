import { beforeEach, describe, expect, it } from 'vitest';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { applyHallConfiguration, currentHallData } from './applyHallConfiguration';
import { hallModelDataSchema, type HallModelData } from './validation/models';
import { openingSchema } from './validation/configuration';
import { useHistoryStore } from '@/stores/useHistoryStore';

const model: HallModelData = {
  dimensions: { length: 30, width: 15, height: 5 },
  roofType: 'mono',
  highSide: 'left',
  foundation: false,
  sandwichPanels: true,
  insulation: 120,
  openingsList: [
    { id: 'w1', type: 'window', wallId: 'PereteDR', offsetX: 3, sill: 1.2, width: 2, height: 1 },
    { id: 'd1', type: 'door', wallId: 'PereteFata', offsetX: 2, sill: 0, width: 1, height: 2.1 },
  ],
  colors: {
    walls: { id: 'walls-ral7016', name: 'Antracit', hex: '#383e42' },
    roof: { id: 'roof-ral9002', name: 'Alb-gri', hex: '#e7ebda' },
  },
};

beforeEach(() => {
  useConfiguratorStore.getState().resetConfigurator();
  useOpeningsStore.getState().resetOpenings();
});

describe('loading a model into the configurator', () => {
  it('sets every option and remembers the model', () => {
    applyHallConfiguration(model, { id: 'm1', name: 'Atelier' });
    const s = useConfiguratorStore.getState();
    expect([s.length, s.width, s.height, s.roofType, s.highSide]).toEqual([30, 15, 5, 'mono', 'left']);
    expect([s.showFoundation, s.hasSandwichPanels, s.isIsolated, s.insulation]).toEqual([false, true, true, 120]);
    expect(s.colors.walls.id).toBe('walls-ral7016');
    expect(s.colors.trims.name).toBe('Negru'); // not in the model: the default
    expect(s.model).toEqual({ id: 'm1', name: 'Atelier' });
    expect(useOpeningsStore.getState().openings).toHaveLength(2);
  });

  it('reads back what it loaded, in a shape the model API accepts', () => {
    applyHallConfiguration(model);
    const back = currentHallData();
    expect(hallModelDataSchema.safeParse(back).success).toBe(true);
    expect(back.dimensions).toEqual(model.dimensions);
    expect(back.openingsList.map((o) => o.id)).toEqual(['w1', 'd1']);
    expect(back.colors?.roof?.id).toBe('roof-ral9002');
  });

  it('reads back each opening with its anchor, and loading that back is lossless', () => {
    applyHallConfiguration(model);
    const back = currentHallData();
    expect(back.openingsList[0]).toMatchObject({ id: 'w1', offsetX: 3, anchor: { kind: 'bay', bay: 0 } });
    expect(back.openingsList[1]).toMatchObject({ id: 'd1', offsetX: 2, anchor: { kind: 'axis' } });
    applyHallConfiguration(back);
    expect(currentHallData().openingsList).toEqual(back.openingsList);
  });

  it('starts a new undo history', () => {
    useHistoryStore.setState({ past: [{ hall: {} as never, intents: [] }], canUndo: true });
    applyHallConfiguration(model);
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('replaces the previous hall entirely (openings too)', () => {
    applyHallConfiguration(model, { id: 'm1', name: 'Atelier' });
    applyHallConfiguration({ ...model, roofType: undefined, sandwichPanels: false, insulation: 0, openingsList: [] });
    const s = useConfiguratorStore.getState();
    expect(s.roofType).toBe('gable');
    expect(s.isIsolated).toBe(false);
    expect(s.model).toBeNull();
    expect(useOpeningsStore.getState().openings).toEqual([]);
  });
});

describe('server validation of openings (openingSchema)', () => {
  const base = { id: 'o', type: 'window', wallId: 'PereteDR', width: 1, height: 1 };
  const ok = (o: unknown) => openingSchema.safeParse(o).success;

  it('accepts v0, v1 and v2 shapes', () => {
    expect(ok({ ...base, posX: 0.5, posY: 0.5 })).toBe(true);
    expect(ok({ ...base, offsetX: 2, sill: 1 })).toBe(true);
    expect(ok({ ...base, offsetX: 2, sill: 1, anchor: { kind: 'bay', bay: 2, offset: 'centre' } })).toBe(true);
    expect(ok({ ...base, offsetX: 2, sill: 1, anchor: { kind: 'bay', bay: 0, offset: -0.1 } })).toBe(true);
    expect(ok({ ...base, offsetX: 2, sill: 1, anchor: { kind: 'axis', fromCentre: -3.5 } })).toBe(true);
    expect(ok({ ...base, offsetX: 2, sill: 1, anchor: { kind: 'wallStart', offsetX: 2 } })).toBe(true);
  });

  it('keeps the anchor of a v2 opening', () => {
    const parsed = openingSchema.parse({ ...base, offsetX: 2, sill: 1, anchor: { kind: 'axis', fromCentre: 1 } });
    expect(parsed).toMatchObject({ anchor: { kind: 'axis', fromCentre: 1 } });
  });

  it.each([
    ['unknown kind', { kind: 'free', offsetX: 1 }],
    ['fractional bay', { kind: 'bay', bay: 1.5, offset: 0 }],
    ['negative bay', { kind: 'bay', bay: -1, offset: 0 }],
    ['bad offset', { kind: 'bay', bay: 1, offset: 'middle' }],
    ['extra key', { kind: 'axis', fromCentre: 0, x: 1 }],
    ['out of range', { kind: 'axis', fromCentre: 1e6 }],
    ['negative wall start', { kind: 'wallStart', offsetX: -1 }],
    ['not an object', 'centre'],
  ])('rejects a malformed anchor: %s', (_name, anchor) => {
    expect(ok({ ...base, offsetX: 2, sill: 1, anchor })).toBe(false);
    expect(ok({ ...base, posX: 0.5, posY: 0.5, anchor })).toBe(false);
  });
});
