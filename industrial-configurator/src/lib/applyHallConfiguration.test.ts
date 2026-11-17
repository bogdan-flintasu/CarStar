import { beforeEach, describe, expect, it } from 'vitest';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { applyHallConfiguration, currentHallData } from './applyHallConfiguration';
import { hallModelDataSchema, type HallModelData } from './validation/models';

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

  it('replaces the previous hall entirely', () => {
    applyHallConfiguration(model, { id: 'm1', name: 'Atelier' });
    applyHallConfiguration({ ...model, roofType: undefined, sandwichPanels: false, insulation: 0, openingsList: [] });
    const s = useConfiguratorStore.getState();
    expect(s.roofType).toBe('gable');
    expect(s.isIsolated).toBe(false);
    expect(s.model).toBeNull();
    expect(useOpeningsStore.getState().openings).toEqual([]);
  });
});
