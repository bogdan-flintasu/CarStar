import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_LAYERS_VISIBLE } from '@/components/3d/hall/layers';
import { useViewStore } from './useViewStore';

const initial = useViewStore.getState();

describe('useViewStore: section and layers', () => {
  beforeEach(() => useViewStore.setState(initial, true));

  it('starts with the section off at mid-span, caps on, every layer shown', () => {
    const s = useViewStore.getState();
    expect(s.sectionMode).toBe('off');
    expect(s.sectionFraction).toBe(0.5);
    expect(s.sectionCaps).toBe(true);
    expect(s.layers).toEqual(ALL_LAYERS_VISIBLE);
  });

  it('switches the section and clamps its position', () => {
    const s = useViewStore.getState();
    s.setSectionMode('transversal');
    s.setSectionFraction(1.7);
    expect(useViewStore.getState().sectionMode).toBe('transversal');
    expect(useViewStore.getState().sectionFraction).toBe(1);
    s.setSectionFraction(-2);
    expect(useViewStore.getState().sectionFraction).toBe(0);
  });

  it('does not notify for a no-op change', () => {
    const before = useViewStore.getState();
    before.setSectionMode('off');
    before.setSectionFraction(0.5);
    before.setLayer('steel', true);
    expect(useViewStore.getState()).toBe(before);
  });

  it('resets the section, keeping the camera view', () => {
    const s = useViewStore.getState();
    s.goToView('front');
    s.setSectionMode('longitudinal');
    s.setSectionFraction(0.2);
    s.setSectionCaps(false);
    s.resetSection();
    const now = useViewStore.getState();
    expect([now.sectionMode, now.sectionFraction, now.sectionCaps]).toEqual(['off', 0.5, true]);
    expect(now.view).toBe('front');
  });

  it('keeps the section when a fixed view is picked', () => {
    const s = useViewStore.getState();
    s.setSectionMode('transversal');
    s.goToView('top');
    expect(useViewStore.getState().sectionMode).toBe('transversal');
  });

  it('toggles, sets and shows all layers', () => {
    const s = useViewStore.getState();
    s.toggleLayer('roof');
    s.setLayer('steel', false);
    expect(useViewStore.getState().layers).toEqual({ ...ALL_LAYERS_VISIBLE, roof: false, steel: false });
    s.toggleLayer('roof');
    expect(useViewStore.getState().layers.roof).toBe(true);
    s.showAllLayers();
    expect(useViewStore.getState().layers).toEqual(ALL_LAYERS_VISIBLE);
  });
});
