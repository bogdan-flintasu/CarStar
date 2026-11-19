'use client';

/**
 * Live adaptation of the configurator's 3D view (renders nothing; sits in the Canvas).
 *
 * Sampling. The canvas renders on demand, so only frames that were drawn while the view was being moved are timed:
 * after a rendered frame whose camera changed (orbit, zoom, pan, view transitions), one requestAnimationFrame probe
 * measures how long until the browser can start the next frame. That interval covers the frame's main-thread work and
 * the GPU back-pressure, quantised to the screen's refresh. An idle canvas renders nothing and is never sampled; a
 * frame drawn because a slider moved (camera still) is not sampled either.
 *
 * Applying. The governor's level (quality.ts) is turned into settings in the store (`live`), which
 * ConfiguratorEngine passes to the Canvas (`dpr`), the sun (`shadowMapSize`) and `<Environment>`; the far-detail flag
 * is read by qualityDetail.ts. A resized shadow map is reallocated here. While an offscreen render runs (quote
 * renders, snapshots) nothing is sampled and no new setting is applied: it is held until they are done.
 *
 * Dev only: `window.__hallQuality` (describe(), setMode(), the ladder and the hall-cost estimate) for scripts.
 */
import { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import { DirectionalLight, Matrix4, SpotLight } from 'three';
import { getGraphicsSettings } from '@/lib/hardwareTier';
import { QUALITY_TUNING, QualityGovernor, TRIANGLE_BUDGET, seedLevel, type LiveQuality } from './quality';
import { detailStats, offscreenBusy, watchSceneRenders } from './qualityDetail';
import { getQualityLadder, loadSavedQualityMode, useLiveQuality, useQualityStore, type QualityMode } from './qualityStore';
import type { HallCost } from './qualityLod';

declare global {
  interface Window {
    __hallQuality?: {
      describe: () => string;
      setMode: (mode: QualityMode) => void;
      /** Jump to a level (auto mode; the governor carries on from there). */
      setLevel: (level: number) => void;
      detail: () => typeof detailStats;
      ladder: LiveQuality[];
      level: () => number;
      live: () => LiveQuality;
      cost: () => HallCost | null;
    };
  }
}

const describe = (q: LiveQuality, level: number, mode: QualityMode) =>
  `${mode} L${level} env:${q.environment ? 'on' : 'off'} shadow:${q.shadowMapSize} detail:${q.farDetail ? 'far' : 'near'} dpr:${q.dpr}`;

export default function QualityController() {
  const scene = useThree((state) => state.scene);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const live = useLiveQuality();

  useEffect(() => {
    watchSceneRenders(scene);
    loadSavedQualityMode();
  }, [scene]);

  // Governor: sample frames rendered during interaction (auto mode only).
  useEffect(() => {
    const ladder = getQualityLadder();
    const store = useQualityStore;
    const governor = new QualityGovernor(ladder.length - 1, store.getState().level);
    const lastView = new Matrix4();
    const lastProjection = new Matrix4();
    let probe = 0;
    const mountedAt = performance.now();

    // A hall over its tier's triangle budget starts with far detail off (the governor may raise it back).
    const seed = () => {
      const { cost, mode, level, setLevel } = store.getState();
      if (!cost || mode !== 'auto') return;
      const start = seedLevel(ladder, cost.triangles, TRIANGLE_BUDGET[getGraphicsSettings().tier]);
      if (start > level) setLevel(start);
    };
    const unsubscribeStore = store.subscribe((now, before) => {
      if (now.level !== governor.level) governor.setLevel(now.level);
      // A mode switch or a rebuilt hall (new geometry on the GPU) starts a new trend.
      if (now.mode !== before.mode || now.cost !== before.cost) governor.pause();
      if (now.cost !== before.cost || now.mode !== before.mode) seed();
    });
    seed();

    const unsubscribeFrames = addAfterEffect((timestamp) => {
      if (store.getState().mode !== 'auto') return;
      const camera = get().camera;
      const moved = !camera.matrixWorld.equals(lastView) || !camera.projectionMatrix.equals(lastProjection);
      lastView.copy(camera.matrixWorld);
      lastProjection.copy(camera.projectionMatrix);
      if (!moved) return;
      if (performance.now() - mountedAt < QUALITY_TUNING.startupGraceMs) return;
      if (offscreenBusy()) {
        governor.pause();
        return;
      }
      // One probe at a time: it fires at the start of the next frame (possibly after that frame's own render, whose
      // rAF was queued first), and rAF timestamps are the frame's start time, so the interval is still this frame's.
      if (probe) return;
      probe = requestAnimationFrame((next) => {
        probe = 0;
        if (offscreenBusy()) return;
        const level = governor.sample(next - timestamp);
        if (level !== null) store.getState().setLevel(level);
      });
    });

    return () => {
      unsubscribeStore();
      unsubscribeFrames();
      cancelAnimationFrame(probe);
    };
  }, [get]);

  // Apply the requested level, never while an offscreen render runs.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      clearTimeout(timer);
      if (offscreenBusy()) {
        timer = setTimeout(apply, QUALITY_TUNING.offscreenHoldMs);
        return;
      }
      const { mode, level, live: current, setLive } = useQualityStore.getState();
      const ladder = getQualityLadder();
      const next = ladder[mode === 'high' ? 0 : Math.min(level, ladder.length - 1)];
      if (next !== current) setLive(next);
      invalidate();
    };
    apply();
    const unsubscribe = useQualityStore.subscribe((now, before) => {
      if (now.mode !== before.mode || now.level !== before.level) apply();
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [invalidate]);

  // A shadow map is allocated at its size once: a new size needs a new map (the sun's mapSize prop is already set).
  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof DirectionalLight || object instanceof SpotLight) || !object.castShadow) return;
      const map = object.shadow.map;
      if (map && map.width !== object.shadow.mapSize.x) {
        map.dispose();
        object.shadow.map = null;
      }
    });
    invalidate();
  }, [scene, live.shadowMapSize, invalidate]);

  // Dev hook for scripts/measure-perf.mjs.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const state = useQualityStore.getState;
    const current = () => state().live ?? getQualityLadder()[0];
    window.__hallQuality = {
      describe: () => describe(current(), state().mode === 'high' ? 0 : state().level, state().mode),
      setMode: (mode) => state().setMode(mode),
      setLevel: (level) => state().setLevel(level),
      detail: () => detailStats,
      ladder: getQualityLadder(),
      level: () => state().level,
      live: current,
      cost: () => state().cost,
    };
    return () => {
      delete window.__hallQuality;
    };
  }, []);

  return null;
}
