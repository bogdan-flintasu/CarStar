'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Sky, useGLTF, useTexture, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { getGraphicsSettings } from '@/lib/hardwareTier';

// ─── Camera Adjuster for Responsive FOV ───────────────────────────────────────
function CameraAdjuster() {
  const { camera } = useThree();
  
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = isMobile ? 100 : 65;
        camera.updateProjectionMatrix();
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [camera]);
  
  return null;
}

// ─── Interior camera that moves based on scroll progress ──────────────────────
function ScrollCamera() {
  const { camera } = useThree();

  useFrame(() => {
    // Read scroll directly to avoid React state lag
    const scrollTop = window.scrollY;
    const scrollHeight = document.body.scrollHeight - window.innerHeight;
    const scrollProgress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

    // Camera path: from inside the hall to the far end
    const startZ = -6; // Start further inside
    const endZ = -22;
    const t = Math.min(1, Math.max(0, scrollProgress));

    // Smooth easing
    const eased = t * t * (3 - 2 * t); // smoothstep

    const z = startZ + (endZ - startZ) * eased;
    const y = 2.5 + Math.sin(eased * Math.PI * 0.3) * 0.8; // Subtle vertical sway

    camera.position.set(0, y, z);
    camera.lookAt(0, 2.5, z - 10);
  });

  return null;
}

// ─── Hall model for landing page (interior view, stripped down) ────────────────
function LandingHallCore({ foundationTextures, frameCount }: { foundationTextures?: Record<string, THREE.Texture>; frameCount: number }) {
  const { scene: gltfScene } = useGLTF('/models/da-draco.glb');

  const model = useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.position.set(0, 0, 0);

    // Apply foundation texture to beton
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.name === 'beton') {
        if (foundationTextures) {
          child.material = new THREE.MeshStandardMaterial({
            map: foundationTextures.map,
            normalMap: foundationTextures.normalMap,
            roughnessMap: foundationTextures.roughnessMap,
            color: new THREE.Color('#8a8a8a'),
            roughness: 0.9,
            metalness: 0.0,
            normalScale: new THREE.Vector2(1.5, 1.5),
          });
          const maps = ['map', 'normalMap', 'roughnessMap'];
          maps.forEach((m) => {
            const tex = (child.material as Record<string, unknown>)[m] as THREE.Texture | undefined;
            if (tex) {
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.repeat.set(6, 6);
              tex.needsUpdate = true;
            }
          });
        } else {
          child.material = new THREE.MeshStandardMaterial({
            color: '#888888',
            roughness: 0.9,
            metalness: 0.1,
          });
        }
      }
      // Identify special meshes for visibility logic
      if (child.name.includes('Grinda')) child.userData.isGrinda = true;
      if (child.name === 'burlan_spateSTG' || child.name === 'burlan_spateDR' ||
        child.name === 'jgheab_spateSTG' || child.name === 'jgheab_spateDR' ||
        child.name === 'jgheabDR_prelungire' || child.name === 'jgheabSTG_prelungire') {
        child.userData.isSpateMesh = true;
      }
      if (child.name === 'PereteSTG' || child.name === 'PereteDR' || child.name === 'AcoperisSTG' || child.name === 'AcoperisDR' ||
        child.name === 'beton' || child.name === 'jgheabSTG' || child.name === 'jgheabDR' || child.name === 'coltar_acoperis' || child.name === 'PereteFata' || child.name === 'PereteSpate') {
        child.userData.isLastFrameWall = true;
      }

      // Hide 3m screws/bolts since height is 3m
      if (['suruburi_laterale002', 'suruburi_laterale003', 'suruburi_laterale011', 'suruburi_laterale012'].includes(child.name)) {
        child.visible = false;
      }
    });

    return cloned;
  }, [gltfScene, foundationTextures]);

  // Build multiple frames for a long hall
  const frames = useMemo(() => {
    const group = new THREE.Group();
    for (let i = 0; i < frameCount; i++) {
      const frame = model.clone(true);
      frame.position.z = -i * 6;
      group.add(frame);
    }

    // Apply visibility rules
    const lastIndex = frameCount - 1;
    const secondToLastIndex = frameCount - 2;

    group.children.forEach((frame, index) => {
      frame.traverse((child) => {
        // Hide beams and walls that would block the interior view on middle frames
        if (child.userData.isGrinda || child.userData.isLastFrameWall) {
          if (child.name === 'PereteSTG' || child.name === 'PereteDR' || child.name === 'AcoperisSTG' || child.name === 'AcoperisDR' || child.name === 'beton') {
            // Keep side walls and roof visible on all frames EXCEPT the last frame (like the configurator does)
            child.visible = index !== lastIndex;
          } else {
            // Hide interior walls and beams
            child.visible = index === lastIndex || index === 0;
            
            // Fix PereteFata / PereteSpate explicitly
            if (child.name === 'PereteFata') child.visible = index === 0;
            if (child.name === 'PereteSpate') child.visible = index === lastIndex;
          }
        }
        
        // Handle spate meshes
        if (child.userData.isSpateMesh) {
          child.visible = index === secondToLastIndex;
        }
      });
    });

    return group;
  }, [model, frameCount]);

  return <primitive object={frames} />;
}

function LandingHallDesktop({ frameCount }: { frameCount: number }) {
  const foundationTextures = useTexture({
    map: 'concrete/concrete_color.webp',
    normalMap: 'concrete/concrete_normal.webp',
    roughnessMap: 'concrete/concrete_roughness.webp',
  });
  return <LandingHallCore foundationTextures={foundationTextures} frameCount={frameCount} />;
}

function LandingHallMobile({ frameCount }: { frameCount: number }) {
  return <LandingHallCore frameCount={frameCount} />;
}

function LandingHallWrapper({ frameCount }: { frameCount: number }) {
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile ? <LandingHallMobile frameCount={frameCount} /> : <LandingHallDesktop frameCount={frameCount} />;
}

// ─── Ground plane ─────────────────────────────────────────────────────────────
function GroundMobile() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial color="#3a5a2a" roughness={1} metalness={0} />
    </mesh>
  );
}

function GroundDesktop() {
  const textures = useTexture({
    map: 'grass/grass_color.webp',
    normalMap: 'grass/grass_normal.webp',
    roughnessMap: 'grass/grass_roughness.webp',
  });

  Object.values(textures).forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(200, 200);
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial {...textures} />
    </mesh>
  );
}

function GroundWrapper() {
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile ? <GroundMobile /> : <GroundDesktop />;
}

// ─── Readiness reporter — fires onReady when all assets finish loading ────────
function ReadinessReporter({ onReady }: { onReady: () => void }) {
  const { active, progress } = useProgress();
  const fired = useRef(false);

  useEffect(() => {
    if (!active && progress >= 100 && !fired.current) {
      fired.current = true;
      // Small delay to let the first frame render
      setTimeout(onReady, 200);
    }
  }, [active, progress, onReady]);

  return null;
}

// ─── Main scene component ─────────────────────────────────────────────────────
export default function LandingScene({ onReady }: { onReady?: () => void }) {
  const gfx = getGraphicsSettings();

  return (
    <Canvas
      camera={{ fov: 65, near: 0.1, far: 500, position: [0, 2.5, -6] }}
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={gfx.dpr}
      style={{ width: '100%', height: '100%' }}
      gl={{ localClippingEnabled: true, powerPreference: 'high-performance', antialias: false }}
    >
      <CameraAdjuster />
      <directionalLight
        position={[5, 15, 5]}
        intensity={0.6}
        castShadow
        shadow-mapSize-width={gfx.shadowMapSize}
        shadow-mapSize-height={gfx.shadowMapSize}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <ambientLight intensity={0.4} />

      {gfx.enableSky && (
        <Sky
          distance={450000}
          sunPosition={[-5, 10, 5]}
          inclination={0}
          azimuth={0.25}
        />
      )}

      {gfx.enableEnvironment && <Environment preset="city" />}
      <GroundWrapper />
      <LandingHallWrapper frameCount={gfx.landingFrameCount} />
      <ScrollCamera />
      {onReady && <ReadinessReporter onReady={onReady} />}
    </Canvas>
  );
}

