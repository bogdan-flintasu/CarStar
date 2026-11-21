'use client';

/**
 * The configurator's 3D view: the hall for the current store values, on its site, with openings and dimensions.
 * All geometry comes from one HallLayout; the canvas renders on demand, so the GPU is idle while nothing changes.
 */
import { useEffect, useMemo } from 'react';
import { Canvas, events as createPointerEvents } from '@react-three/fiber';
import { Environment, Sky } from '@react-three/drei';
import { type Intersection, PCFShadowMap } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { getGraphicsSettings } from '@/lib/hardwareTier';
import { clampHallDimensions, computeHallLayout } from '@/lib/hall';
import { colorHexes } from '@/lib/colors';
import Hall from '@/components/3d/hall/Hall';
import CameraRig from '@/components/3d/hall/CameraRig';
import { CONFIGURATOR_FOV } from '@/lib/hall/cameraViews';
import { Ground, Sun } from '@/components/3d/hall/Site';
import { requestHallFraming, useHallFramingRequests } from '@/components/3d/hall/framing';
import HallStatsProbe from '@/components/3d/hall/HallStatsProbe';
import QualityController from '@/components/3d/hall/qualityController';
import { useLiveQuality } from '@/components/3d/hall/qualityStore';
import { SnapshotProvider } from '@/components/3d/hall/snapshot';
import { HallRenderProvider, renderHiddenProps } from '@/components/3d/hall/renders';
import { ArExportProvider } from '@/components/3d/ar/arExport';
import { useHallUrlParams } from '@/components/3d/hall/useHallUrlParams';
import ComponentPicker from '@/components/3d/hall/ComponentPicker';
import ComponentHighlight from '@/components/3d/hall/ComponentHighlight';
import PlacementPreview from '@/components/3d/openings/PlacementPreview';
import WallOpenings from '@/components/3d/WallOpenings';
import DimensionLines from '@/components/3d/DimensionLines';
import FlatViewDimensions from '@/components/3d/drawings/FlatViewDimensions';
import { drawingForView } from '@/components/3d/drawings/flatView';
import { useViewStore } from '@/stores/useViewStore';
import SectionCut from '@/components/3d/hall/SectionCut';
import { filterPickHits, sectionClipProps } from '@/components/3d/hall/sectionPick';
import { layerProps } from '@/components/3d/hall/layers';
import { useAccentColor, useUiTheme } from './UiThemeScope';
import WalkRig from '@/components/3d/walk/WalkRig';
import WalkStaging from '@/components/3d/walk/WalkStaging';
import { selectWalking, useWalkStore } from '@/stores/useWalkStore';

/** Pointer events skip what the user cannot see: hidden layers and the parts the section cut removed (T3d). */
const pointerEvents = (store: Parameters<typeof createPointerEvents>[0]) => ({
  ...createPointerEvents(store),
  filter: (hits: Intersection[]) => filterPickHits(hits),
});

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
  const { height, width, length, showFoundation, isIsolated, insulation, wallsVisible, currentStep, roofType, highSide } = useConfiguratorStore(
    useShallow((s) => ({
      height: s.height,
      width: s.width,
      length: s.length,
      showFoundation: s.showFoundation,
      isIsolated: s.isIsolated,
      insulation: s.insulation,
      wallsVisible: s.wallsVisible,
      currentStep: s.currentStep,
      roofType: s.roofType,
      highSide: s.highSide,
    })),
  );
  const colors = useConfiguratorStore((s) => s.colors);
  const hexes = useMemo(() => colorHexes(colors), [colors]);
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
        roofType,
        highSide,
      }),
    [width, height, length, showFoundation, isIsolated, insulation, roofType, highSide],
  );

  // In step 2 (panels) the cladding is always shown, so the effect of the panel options is visible.
  // Walking (src/components/3d/walk): the hall as built, cladding on, no editing helpers.
  const walking = useWalkStore(selectWalking);
  const claddingVisible = walking || currentStep === 2 || wallsVisible;
  const gfx = getGraphicsSettings();
  // Adaptive quality (qualityController.tsx): starts at the tier's settings, lowered while frames are slow.
  const quality = useLiveQuality();
  // The admin can turn the sky off: the hall then stands on the plain viewport colour of the theme.
  const { sky } = useUiTheme();
  const accent = useAccentColor();
  // On an orthographic elevation or plan, the drawing's dimensions replace the 3D ones.
  const onFlatView = useViewStore((s) => drawingForView(s.view, s.projection) !== null);
  const layers = useViewStore((s) => s.layers);

  return (
    <Canvas
      camera={{ fov: CONFIGURATOR_FOV, near: 0.1, far: 1000, position: [-11, 13, 24] }}
      shadows={{ type: PCFShadowMap }}
      frameloop="demand"
      dpr={quality.dpr}
      style={{ background: 'var(--ui-viewport, #dddddd)', width: '100%', height: '100%' }}
      gl={{ powerPreference: 'high-performance', antialias: gfx.antialias }}
      events={pointerEvents}
    >
      <Sun layout={layout} intensity={0.7} shadowMapSize={quality.shadowMapSize} />
      <ambientLight intensity={0.5} />
      {/* Quote renders bring their own sky (src/components/3d/stage). */}
      {gfx.enableSky && sky && !walking && (
        <group {...renderHiddenProps}>
          <Sky distance={450000} sunPosition={[-5, 10, 5]} inclination={0} azimuth={0.25} />
        </group>
      )}
      {quality.environment && <Environment preset="city" />}
      <Ground layout={layout} textured={gfx.tier !== 'low'} />

      <CameraRig layout={layout} enabled={!isDraggingOpening} frameKey={framingRequests} suspended={walking} />
      <WalkRig layout={layout} />
      <WalkStaging layout={layout} />

      <group {...sectionClipProps}>
        <Hall
          layout={layout}
          claddingVisible={claddingVisible}
          detail={gfx.tier === 'low' ? 'light' : 'full'}
          holes={openings}
          colors={hexes}
          onWallHover={placingOpening && !walking ? setHoveredWallId : undefined}
          layers={layers}
        />
      </group>

      {/* Editing helpers: never in the quote renders, nor while walking. */}
      <group {...renderHiddenProps} visible={!walking}>
        <DimensionLines layout={layout} visible={!claddingVisible && !onFlatView} color={accent} />
        <FlatViewDimensions layout={layout} openings={openings} color={accent} />
        {/* Openings hide themselves with the cladding (same rule as above). */}
        <PlacementPreview layout={layout} />
        {!walking && <ComponentPicker layout={layout} claddingVisible={claddingVisible} />}
        <ComponentHighlight layout={layout} />
        <SectionCut layout={layout} holes={openings} claddingVisible={claddingVisible} layers={layers} color={accent} />
      </group>
      {/* The "Goluri" layer, cut by the section like the hall. */}
      <group {...layerProps('openings', layers)} userData={{ ...layerProps('openings').userData, ...sectionClipProps.userData }}>
        <WallOpenings layout={layout} realHoles colors={hexes} />
      </group>

      <SnapshotProvider />
      <HallRenderProvider layout={layout} />
      <ArExportProvider layout={layout} />
      <QualityController />
      {process.env.NODE_ENV !== 'production' && <HallStatsProbe layout={layout} />}
    </Canvas>
  );
}
