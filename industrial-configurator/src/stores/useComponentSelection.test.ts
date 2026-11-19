import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeHallLayout } from '@/lib/hall';
import { resolvePick, type PickedComponent } from '@/components/3d/hall/ComponentPicker.map';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

async function loadStores() {
  vi.resetModules();
  const storage = memoryStorage();
  // zustand persist (the openings store) reads `window.localStorage`; node has neither.
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  const [selection, openings] = await Promise.all([import('./useComponentSelection'), import('./useOpeningsStore')]);
  return { useComponentSelection: selection.useComponentSelection, useOpeningsStore: openings.useOpeningsStore };
}

const layout = computeHallLayout({ width: 12, length: 12, height: 4, foundation: true, panels: true, insulationMm: 100 });
const column = resolvePick({ objectName: 'Column', instanceId: 0, point: [0, 0, 0] }, layout) as PickedComponent;

describe('useComponentSelection', () => {
  let stores: Awaited<ReturnType<typeof loadStores>>;
  beforeEach(async () => {
    stores = await loadStores();
  });

  it('selects and clears', () => {
    const { useComponentSelection } = stores;
    expect(useComponentSelection.getState().selected).toBeNull();
    useComponentSelection.getState().select(column);
    expect(useComponentSelection.getState().selected?.key).toBe('column:left:0');
    useComponentSelection.getState().clear();
    expect(useComponentSelection.getState().selected).toBeNull();
  });

  it('clears the opening selection when a component is selected', () => {
    const { useComponentSelection, useOpeningsStore } = stores;
    useOpeningsStore.getState().selectOpening('door-1');
    useComponentSelection.getState().select(column);
    expect(useOpeningsStore.getState().selectedOpeningId).toBeNull();
    expect(useComponentSelection.getState().selected).not.toBeNull();
  });

  it('clears the component when an opening is selected or an opening tool is picked', () => {
    const { useComponentSelection, useOpeningsStore } = stores;
    useComponentSelection.getState().select(column);
    useOpeningsStore.getState().selectOpening('door-1');
    expect(useComponentSelection.getState().selected).toBeNull();

    useComponentSelection.getState().select(column);
    useOpeningsStore.getState().setActiveTool('window');
    expect(useComponentSelection.getState().selected).toBeNull();
  });

  it('keeps the component when the opening selection is cleared', () => {
    const { useComponentSelection, useOpeningsStore } = stores;
    useComponentSelection.getState().select(column);
    useOpeningsStore.getState().selectOpening(null);
    useOpeningsStore.getState().setIsDragging(false);
    expect(useComponentSelection.getState().selected?.key).toBe('column:left:0');
  });
});
