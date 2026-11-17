'use client';

/**
 * The quote pictures of the current hall, kept between visits to the summary: they are rendered again only when the
 * configuration changed (`renderKey`). `ensureHallRenders()` is what saving a configuration waits for.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { renderHallViews, type HallRender } from '@/components/3d/hall/renders';
import { currentHallData } from '@/lib/applyHallConfiguration';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';

export interface RenderedView extends HallRender {
  /** Object URL of `blob`, for <img>. */
  url: string;
}

type Status = 'idle' | 'rendering' | 'ready' | 'error';

interface RendersState {
  status: Status;
  /** Configuration the views show. */
  key: string | null;
  views: RenderedView[];
  done: number;
}

const useRendersStore = create<RendersState>(() => ({ status: 'idle', key: null, views: [], done: 0 }));

/** Everything that changes how the hall looks. */
export function renderKey(): string {
  return JSON.stringify(currentHallData());
}

let pending: { key: string; promise: Promise<RenderedView[]> } | null = null;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits until the hall is on screen, with the summary's state (cladding on, nothing selected) applied. */
async function hallSettled(): Promise<void> {
  const openings = useOpeningsStore.getState();
  openings.selectOpening(null);
  openings.setActiveTool(null);
  openings.setHoveredWallId(null);
  for (let i = 0; i < 600 && !useConfiguratorStore.getState().hallReady; i++) await nextFrame();
  // Let React apply the state above to the scene before the first view is drawn.
  await nextFrame();
  await nextFrame();
}

/** The pictures of the hall as it is now: the cached ones when nothing changed, else rendered again. */
export function ensureHallRenders(): Promise<RenderedView[]> {
  const key = renderKey();
  const state = useRendersStore.getState();
  if (state.status === 'ready' && state.key === key) return Promise.resolve(state.views);
  if (pending?.key === key) return pending.promise;

  const promise = (async () => {
    useRendersStore.setState({ status: 'rendering', done: 0 });
    try {
      await hallSettled();
      const renders = await renderHallViews({ onProgress: (done) => useRendersStore.setState({ done }) });
      const views = renders.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
      // A newer request may have finished meanwhile: only the latest configuration's pictures are kept.
      if (pending?.key === key) {
        useRendersStore.getState().views.forEach((v) => URL.revokeObjectURL(v.url));
        useRendersStore.setState({ status: 'ready', key, views, done: views.length });
      }
      return views;
    } catch (error) {
      if (pending?.key === key) useRendersStore.setState({ status: 'error' });
      throw error;
    } finally {
      if (pending?.key === key) pending = null;
    }
  })();
  pending = { key, promise };
  return promise;
}

/** Renders the pictures when the summary opens (again only if the hall changed) and returns their state. */
export function useHallRenders(): RendersState & { retry: () => void } {
  const state = useRendersStore();
  useEffect(() => {
    ensureHallRenders().catch((error) => console.error('Rendering the hall failed:', error));
  }, []);
  return { ...state, retry: () => void ensureHallRenders().catch(() => undefined) };
}
