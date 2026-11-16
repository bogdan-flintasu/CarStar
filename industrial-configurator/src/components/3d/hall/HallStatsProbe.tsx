'use client';

/**
 * Dev-only verification hook (D10): publishes `window.__hallStats` after every rendered frame, so 3D work can be
 * checked with numbers instead of screenshots. Renders nothing; does nothing in a production build.
 *
 *   triangles, drawCalls   measured: `gl.info.render` of the last frame (the shadow pass is included)
 *   frames                 measured: portal frames actually in the scene
 *   renderFrame            measured: the renderer's frame counter; it stands still while the GPU is idle
 *   expectedFrames, purlinsPerSide, eaveY, ridgeY
 *                          computed by computeHallLayout for `params`: what the hall should have
 *   ready                  the hall is in the scene and has been drawn
 */
import { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import type { Object3D } from 'three';
import type { HallLayout } from '@/lib/hall';

/** `legacy`: the original cloned-GLB engine (Configurator.tsx). `layout`: the engine built on computeHallLayout. */
export type HallEngine = 'legacy' | 'layout';

export interface HallStats {
  triangles: number;
  drawCalls: number;
  frames: number;
  expectedFrames: number;
  purlinsPerSide: number;
  eaveY: number;
  ridgeY: number;
  renderFrame: number;
  engine: HallEngine;
  params: { w: number; h: number; l: number };
  ready: boolean;
}

declare global {
  interface Window {
    __hallStats?: HallStats;
  }
}

/** Depth-first search that stops at the first match. */
function findObject(root: Object3D, matches: (object: Object3D) => boolean): Object3D | undefined {
  if (matches(root)) return root;
  for (const child of root.children) {
    const found = findObject(child, matches);
    if (found) return found;
  }
  return undefined;
}

/** The legacy engine keeps one clone of the model per frame in an unnamed group and tags them `isBase`. */
function countLegacyFrames(scene: Object3D): number {
  return findObject(scene, (object) => object.userData.isBase === true)?.parent?.children.length ?? 0;
}

interface HallStatsProbeProps {
  layout: HallLayout;
  engine: HallEngine;
}

export default function HallStatsProbe({ layout, engine }: HallStatsProbeProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const publish = () => {
      const { triangles, calls, frame } = gl.info.render;
      const frames = engine === 'legacy' ? countLegacyFrames(scene) : layout.frames.length;
      window.__hallStats = {
        triangles,
        drawCalls: calls,
        frames,
        expectedFrames: layout.frames.length,
        purlinsPerSide: layout.purlinsPerSide,
        eaveY: layout.eaveY,
        ridgeY: layout.ridgeY,
        renderFrame: frame,
        engine,
        params: { w: layout.params.width, h: layout.params.height, l: layout.params.length },
        ready: frames > 0 && triangles > 0,
      };
    };

    const unsubscribe = addAfterEffect(publish);
    return () => {
      unsubscribe();
      delete window.__hallStats;
    };
  }, [gl, scene, layout, engine]);

  return null;
}
