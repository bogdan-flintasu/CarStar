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
 *
 * `window.__hallAdvance()` renders one frame now. The canvas renders on demand through requestAnimationFrame, which
 * a hidden or background tab never fires: automated checks call this first, then read `__hallStats`.
 */
import { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import type { InstancedMesh, Object3D } from 'three';
import type { HallLayout } from '@/lib/hall';

export interface HallStats {
  triangles: number;
  drawCalls: number;
  frames: number;
  expectedFrames: number;
  purlinsPerSide: number;
  eaveY: number;
  ridgeY: number;
  renderFrame: number;
  params: { w: number; h: number; l: number };
  /** The user's camera position (checks that quote renders never move it). */
  camera: [number, number, number];
  ready: boolean;
}

declare global {
  interface Window {
    __hallStats?: HallStats;
    __hallAdvance?: () => void;
  }
}

/** Portal frames actually drawn: the instanced columns in the scene, two per frame. */
function countFrames(scene: Object3D): number {
  const columns = scene.getObjectByName('Column') as InstancedMesh | undefined;
  return (columns?.count ?? 0) / 2;
}

interface HallStatsProbeProps {
  layout: HallLayout;
}

export default function HallStatsProbe({ layout }: HallStatsProbeProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const advance = useThree((state) => state.advance);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const publish = () => {
      const { triangles, calls, frame } = gl.info.render;
      const frames = countFrames(scene);
      window.__hallStats = {
        triangles,
        drawCalls: calls,
        frames,
        expectedFrames: layout.frames.length,
        purlinsPerSide: layout.purlinsPerSide,
        eaveY: layout.eaveY,
        ridgeY: layout.ridgeY,
        renderFrame: frame,
        params: { w: layout.params.width, h: layout.params.height, l: layout.params.length },
        camera: camera.position.toArray(),
        ready: frames > 0 && triangles > 0,
      };
    };

    const unsubscribe = addAfterEffect(publish);
    window.__hallAdvance = () => advance(performance.now(), true);
    return () => {
      unsubscribe();
      delete window.__hallStats;
      delete window.__hallAdvance;
    };
  }, [gl, scene, camera, layout, advance]);

  return null;
}
