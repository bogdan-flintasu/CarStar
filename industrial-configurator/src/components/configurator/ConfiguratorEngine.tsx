'use client';

import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { ConfiguratorScene, Ground, ControlledOrbitControls } from '@/components/3d/Configurator';
import { Canvas } from '@react-three/fiber';
import { Environment, Sky } from '@react-three/drei';
import * as THREE from 'three';
import PlacementMarkers from '@/components/3d/PlacementMarkers';
import WallOpenings from '@/components/3d/WallOpenings';
import DimensionLines from '@/components/3d/DimensionLines';

export default function ConfiguratorEngine() {
  const {
    height, width, length,
    showFoundation, isIsolated, insulation,
    wallsVisible, currentStep
  } = useConfiguratorStore();

  // In step 2 (Panels), we temporarily force walls to be visible 
  // so the user can see the effect of the toggles
  const effectiveWallsVisible = currentStep === 2 ? true : wallsVisible;

  return (
    <Canvas
      camera={{ fov: 75, near: 0.1, far: 1000, position: [-6, 7, 13] as [number, number, number] }}
      shadows={{ type: THREE.PCFShadowMap }}
      frameloop="always"
      style={{ background: '#dddddd', width: '100%', height: '100%' }}
      gl={{ localClippingEnabled: true }}
    >
      {/* Lumina directionala cu umbre */}
      <directionalLight
        position={[5, 10, 5]}
        intensity={0.7}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.005}
        shadow-normalBias={0.005}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-near={1}
        shadow-camera-far={100}
      />
      {/* Lumina ambientala */}
      <ambientLight intensity={0.5} />

      <Sky
        distance={450000} // How far away the sky is
        sunPosition={[-5, 10, 5]} // Match this to your directionalLight position!
        inclination={0}
        azimuth={0.25}
      />

      <Environment preset="city" /> {/* This adds reflections to the metal */}
      {/* Plan pentru umbre */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
      </mesh>

      <Ground />

      {/* Controale orbit — disabled while dragging/resizing openings */}
      <ControlledOrbitControls />

      {/* Configurator scene — receives slider values as props */}
      <ConfiguratorScene
        height={height}
        width={width}
        length={length}
        showFoundation={showFoundation}
        isIsolated={isIsolated}
        insulation={insulation}
        wallsVisible={effectiveWallsVisible}
      />

      {/* Dimension lines - shown when walls are hidden */}
      <DimensionLines 
        length={length} 
        width={width} 
        height={height} 
        visible={!effectiveWallsVisible} 
      />

      {/* Openings system — placement markers + rendered openings */}
      <PlacementMarkers hallWidth={width} hallHeight={height} hallLength={length} />
      <WallOpenings hallWidth={width} hallHeight={height} hallLength={length} />
    </Canvas>
  );
}
