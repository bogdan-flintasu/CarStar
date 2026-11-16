'use client';

/**
 * The configurator's 3D view: the hall for the current store values, on its site, with openings and dimensions.
 * All geometry comes from one HallLayout; the canvas renders on demand, so the GPU is idle while nothing changes.
 */
import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Sky } from '@react-three/drei';
import { PCFShadowMap } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { getGraphicsSettings } from '@/lib/hardwareTier';
import { clampHallDimensions, computeHallLayout } from '@/lib/hall';
import Hall from '@/components/3d/hall/Hall';
import CameraRig from '@/components/3d/hall/CameraRig';
import { Ground, Sun } from '@/components/3d/hall/Site';
import { requestHallFraming, useHallFramingRequests } from '@/components/3d/hall/framing';
import HallStatsProbe from '@/components/3d/hall/HallStatsProbe';
import { useHallUrlParams } from '@/components/3d/hall/useHallUrlParams';
import PlacementMarkers from '@/components/3d/PlacementMarkers';
import WallOpenings from '@/components/3d/WallOpenings';
import DimensionLines from '@/components/3d/DimensionLines';

/**
 * A reset or a loaded configuration replaces the hall wholesale (several dimensions in one store update):
 * that is when the camera frames it again. Single slider moves never do.
 */
function useFramingOnReplacedHall(): void {
  useEffect(
    () =>
      useConfiguratorStore.subscribe((now, before) => {
        const changed = [now.width !== before.width, now.height !== before.height, now.length !== before.length];
        if (changed.filter(Boolean).length > 1) requestHallFraming();
      }),
    [],
  );
}

export default function ConfiguratorEngine() {
  const { height, width, length, showFoundation, isIsolated, insulation, wallsVisible, currentStep } = useConfiguratorStore(
    useShallow((s) => ({
      height: s.height,
      width: s.width,
      length: s.length,
      showFoundation: s.showFoundation,
      isIsolated: s.isIsolated,
      insulation: s.insulation,
      wallsVisible: s.wallsVisible,
      currentStep: s.currentStep,
    })),
  );
  const openings = useOpeningsStore((s) => s.openings);
  const isDraggingOpening = useOpeningsStore((s) => s.isDragging);
  const placingOpening = useOpeningsStore((s) => s.activeTool !== null);
  const setHoveredWallId = useOpeningsStore((s) => s.setHoveredWallId);

  // Dev only: /configurator?w=13.5&h=4&l=30&step=1 sets the dimensions directly.
  useHallUrlParams();
  useFramingOnReplacedHall();
  const framingRequests = useHallFramingRequests();

  const layout = useMemo(
    () =>
      computeHallLayout({
        ...clampHallDimensions({ width, height, length }),
        foundation: showFoundation,
        panels: isIsolated,
        insulationMm: insulation,
      }),
    [width, height, length, showFoundation, isIsolated, insulation],
  );

  // In step 2 (panels) the cladding is always shown, so the effect of the panel options is visible.
  const claddingVisible = currentStep === 2 || wallsVisible;
  const gfx = getGraphicsSettings();

  return (
    <Canvas
      camera={{ fov: 75, near: 0.1, far: 1000, position: [-6, 7, 13] }}
      shadows={{ type: PCFShadowMap }}
      frameloop="demand"
      dpr={gfx.dpr}
      style={{ background: '#dddddd', width: '100%', height: '100%' }}
      gl={{ powerPreference: 'high-performance', antialias: gfx.antialias }}
    >
      <Sun layout={layout} intensity={0.7} shadowMapSize={gfx.shadowMapSize} />
      <ambientLight intensity={0.5} />
      {gfx.enableSky && <Sky distance={450000} sunPosition={[-5, 10, 5]} inclination={0} azimuth={0.25} />}
      {gfx.enableEnvironment && <Environment preset="city" />}
      <Ground layout={layout} textured={gfx.tier !== 'low'} />

      <CameraRig layout={layout} enabled={!isDraggingOpening} frameKey={framingRequests} />

      <Hall
        layout={layout}
        claddingVisible={claddingVisible}
        detail={gfx.tier === 'low' ? 'light' : 'full'}
        holes={openings}
        onWallHover={placingOpening ? setHoveredWallId : undefined}
      />

      <DimensionLines layout={layout} visible={!claddingVisible} />

      {/* Openings hide themselves with the cladding (same rule as above). */}
      <PlacementMarkers layout={layout} />
      <WallOpenings layout={layout} realHoles />

      {process.env.NODE_ENV !== 'production' && <HallStatsProbe layout={layout} />}
    </Canvas>
  );
}
