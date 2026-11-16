'use client';

/**
 * Landing-page backdrop: a walk through the inside of a hall, driven by the page scroll.
 * It draws the same <Hall> as the configurator, from one fixed layout, and renders only when the page scrolls.
 */
import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Sky, useProgress } from '@react-three/drei';
import { PCFShadowMap, PerspectiveCamera } from 'three';
import { computeHallLayout } from '@/lib/hall';
import { getGraphicsSettings } from '@/lib/hardwareTier';
import Hall from '@/components/3d/hall/Hall';
import { Ground, Sun } from '@/components/3d/hall/Site';

/** The showcase hall: long enough for the whole camera path to stay inside it. */
const LANDING_LAYOUT = computeHallLayout({ width: 12, height: 5, length: 36, foundation: true, panels: true, insulationMm: 60 });

/** Camera path along the hall's axis (Z), from the top of the page to its bottom. */
const PATH = { startZ: -6, endZ: -22, eyeY: 2.5, sway: 0.8, lookAhead: 10 };
const MOBILE_BREAKPOINT = 768;
const FOV = { mobile: 100, desktop: 65 };

function scrollProgress(): number {
  const scrollable = document.body.scrollHeight - window.innerHeight;
  return scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
}

/** Moves the camera along PATH as the page scrolls, and widens the view on narrow screens. */
function ScrollCamera() {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const redraw = () => invalidate();
    window.addEventListener('scroll', redraw, { passive: true });
    window.addEventListener('resize', redraw);
    return () => {
      window.removeEventListener('scroll', redraw);
      window.removeEventListener('resize', redraw);
    };
  }, [invalidate]);

  useFrame(({ camera }) => {
    const t = scrollProgress();
    const eased = t * t * (3 - 2 * t); // smoothstep
    const z = PATH.startZ + (PATH.endZ - PATH.startZ) * eased;
    camera.position.set(0, PATH.eyeY + Math.sin(eased * Math.PI * 0.3) * PATH.sway, z);
    camera.lookAt(0, PATH.eyeY, z - PATH.lookAhead);

    const fov = window.innerWidth < MOBILE_BREAKPOINT ? FOV.mobile : FOV.desktop;
    if (camera instanceof PerspectiveCamera && camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** Calls `onReady` once, shortly after every asset has loaded (the first frame is on screen by then). */
function ReadinessReporter({ onReady }: { onReady: () => void }) {
  const { active, progress } = useProgress();
  const fired = useRef(false);

  useEffect(() => {
    if (active || progress < 100 || fired.current) return;
    fired.current = true;
    // Not cancelled on re-render: the effect re-runs while progress settles, and the call must still happen once.
    setTimeout(onReady, 200);
  }, [active, progress, onReady]);

  return null;
}

export default function LandingScene({ onReady }: { onReady?: () => void }) {
  const gfx = getGraphicsSettings();

  return (
    <Canvas
      camera={{ fov: FOV.desktop, near: 0.1, far: 500, position: [0, PATH.eyeY, PATH.startZ] }}
      shadows={{ type: PCFShadowMap }}
      frameloop="demand"
      dpr={gfx.dpr}
      style={{ width: '100%', height: '100%' }}
      gl={{ powerPreference: 'high-performance', antialias: gfx.antialias }}
    >
      <Sun layout={LANDING_LAYOUT} intensity={0.6} shadowMapSize={gfx.shadowMapSize} />
      <ambientLight intensity={0.4} />
      {gfx.enableSky && <Sky distance={450000} sunPosition={[-5, 10, 5]} inclination={0} azimuth={0.25} />}
      {gfx.enableEnvironment && <Environment preset="city" />}
      <Ground layout={LANDING_LAYOUT} textured={!gfx.isMobile} />

      <Hall
        layout={LANDING_LAYOUT}
        detail={gfx.tier === 'low' || gfx.tier === 'medium' ? 'light' : 'full'}
        texturedConcrete={!gfx.isMobile}
      />

      <ScrollCamera />
      {onReady && <ReadinessReporter onReady={onReady} />}
    </Canvas>
  );
}
