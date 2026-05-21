'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, useGLTF, Sky, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// ─── Constants (same as original) ────────────────────────────────────────────
const model_height = 6;
const initial_width = 12;
const distanceLength = 6;
const DeltaX = 1.5363;
const DeltaY = 0.27089;
const model_width = 12;
const minWidth = 8;
const midWidth = 12;
const maxWidth = 20;
const maxrise = 0.696;
const minrise = -0.335;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConfiguratorProps {
  height: number;
  width: number;
  length: number;
  showFoundation: boolean;
  isIsolated: boolean;
  insulation: number;
}

// ─── Inner R3F scene component ────────────────────────────────────────────────
// Lives inside <Canvas> so it has access to useThree / useGLTF
function ConfiguratorScene({ height, width, length, showFoundation, isIsolated, insulation }: ConfiguratorProps) {



  const { camera, controls, scene } = useThree();
  const metalTextures = useTexture({
    map: 'metal/metal_color.jpg',
    normalMap: 'metal/metal_normal.jpg',
    roughnessMap: 'metal/metal_roughness.jpg',
    metalnessMap: 'metal/metal_metal.jpg',
  });

  // Industrial metal shouldn't repeat as much as grass
  Object.values(metalTextures).forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
  });

  const wallTextures = useTexture({
    map: 'wall/wall_color.jpg',
    normalMap: 'wall/wall_normal.jpg',
    roughnessMap: 'wall/wall_roughness.jpg',
  });

  const foundationTextures = useTexture({
    map: 'concrete/concrete_color.jpg',
    normalMap: 'concrete/concrete_normal.jpg',
    roughnessMap: 'concrete/concrete_roughness.jpg',
  });

  // Walls repeat a lot to create the corrugated rib effect
  Object.values(wallTextures).forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    // Adjust these numbers until the ribs look like the right size
    t.repeat.set(1, 20);
  });

  // (clipPlanes removed – gable panels now use custom geometry instead of clipping)

  // GLTF loader (replaces: loader.load(window.MODEL_URL, ...))
  const { scene: gltfScene } = useGLTF('/models/jgheaburi-2.gltf');

  // ── Imperative state refs  (mirrors original module-level variables) ───────
  const resize_height = useRef<THREE.Mesh[]>([]);
  const lowered = useRef<THREE.Object3D[]>([]);
  const threemeters = useRef<THREE.Object3D[]>([]);
  const fourmeters_lower = useRef<THREE.Object3D[]>([]);
  const fourmeters_height = useRef(0);
  const fivemeters = useRef<THREE.Object3D[]>([]);
  const resize_width = useRef<THREE.Mesh[]>([]);
  const left = useRef<THREE.Mesh[]>([]);
  const right = useRef<THREE.Mesh[]>([]);
  const grinzi = useRef<THREE.Mesh[]>([]);
  const grinziLeft = useRef<THREE.Mesh[]>([]);
  const grinziRight = useRef<THREE.Mesh[]>([]);
  const sideWalls = useRef<THREE.Mesh[]>([]);

  // Clip planes — declared here (before helpers) so closures can reference them safely.
  const clipPlanes = useRef<THREE.Plane[]>([
    new THREE.Plane(),
    new THREE.Plane(),
    new THREE.Plane(),
    new THREE.Plane(),
  ]);
  // Two Z-axis planes that clip PereteSTG/PereteDR to the lateral edges of AcoperisSTG/AcoperisDR.
  const sideClipPlanes = useRef<THREE.Plane[]>([
    new THREE.Plane(), // single eave-height cut
    new THREE.Plane(), // spare (unused for now)
  ]);
  const sideClipHelperRef = useRef<THREE.PlaneHelper | null>(null);

  const initial_scale = useRef(1);
  const baza_stalp = useRef<THREE.Mesh | null>(null);
  const baza_stalp001 = useRef<THREE.Mesh | null>(null);
  const suruburi_sus001 = useRef<THREE.Mesh | null>(null);
  const suruburi_sus002 = useRef<THREE.Mesh | null>(null);
  const plane_sus_1 = useRef<THREE.Mesh | null>(null);
  const plane_sus_2 = useRef<THREE.Mesh | null>(null);
  const baseModel = useRef<THREE.Object3D | null>(null);
  const modelsGroup = useRef<THREE.Group | null>(null);
  const lastGrindaLeft = useRef<THREE.Mesh | null>(null);
  const lastGrindaRight = useRef<THREE.Mesh | null>(null);
  const extraGrindaLeft = useRef<THREE.Mesh | null>(null);
  const extraGrindaRight = useRef<THREE.Mesh | null>(null);
  const extraGrindaLeftTemplate = useRef<THREE.Mesh | null>(null);
  const extraGrindaRightTemplate = useRef<THREE.Mesh | null>(null);
  const newGrindaLeft = useRef<THREE.Mesh | null>(null);
  const newGrindaRight = useRef<THREE.Mesh | null>(null);
  const newGrindaLeftTemplate = useRef<THREE.Mesh | null>(null);
  const newGrindaRightTemplate = useRef<THREE.Mesh | null>(null);

  const currentRise = useRef(0);
  const ok = useRef(true);

  // Track previous prop values to detect which slider actually changed
  const prevHeight = useRef(height);
  const prevWidth = useRef(width);
  const prevLength = useRef(length);
  // Always-current height ref (avoids stale closure inside width effect)
  const heightRef = useRef(height);
  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  // ── Helpers (exact translation of original functions) ─────────────────────

  function updateCamera(len: number) {
    camera.position.set(
      Math.min(-10, -len * 0.3),
      Math.max(6, len * 0.2),
      Math.max(10, len * 0.2)
    );
    const centerZ = -len / 2;
    // controls is the OrbitControls instance when makeDefault is set
    if (controls) {
      (controls as unknown as { target: THREE.Vector3; update(): void })
        .target.set(0, 0, centerZ);
      (controls as unknown as { update(): void }).update();
    }
  }

  /** Hide grinzi + end wall panels on the last length segment (same rule as original beams). */
  function updateLastFrameBeams() {
    const mg = modelsGroup.current;
    if (!mg || mg.children.length === 0) return;
    const lastIndex = mg.children.length - 1;
    mg.children.forEach((frame, i) => {
      frame.traverse(child => {
        const hideOnLastFrame = child.userData.isGrinda || child.userData.isLastFrameWall;
        if (!hideOnLastFrame) return;
        child.visible = i !== lastIndex;
      });
    });
  }

  /** Show spate objects only on the second-to-last frame. */
  function updateSpateVisibility() {
    const mg = modelsGroup.current;
    if (!mg || mg.children.length === 0) return;
    const secondToLastIndex = mg.children.length - 2;
    const spateNames = ['burlan_spateDR', 'burlan_spateSTG', 'jgheab_spateDR', 'jgheab_spateSTG'];
    mg.children.forEach((frame, index) => {
      spateNames.forEach(spateName => {
        const spate = frame.getObjectByName(spateName) as THREE.Object3D | undefined;
        if (spate) {
          spate.visible = index === secondToLastIndex;
        }
      });
    });
  }

  function syncGrinziFor15() {
    const mg = modelsGroup.current;
    if (!mg) return;
    mg.children.forEach((frame, index) => {
      if (index === 0) return;
      const lgLeft = lastGrindaLeft.current;
      const egLeft = extraGrindaLeft.current;
      if (!frame.getObjectByName('extraGrindaLeft') && egLeft && lgLeft) {
        const anchorLeft = frame.getObjectByName(lgLeft.name);
        if (anchorLeft) {
          const clone = egLeft.clone(true);
          clone.name = 'extraGrindaLeft';
          clone.userData.isGrinda = true;
          clone.position.copy(egLeft.position);
          anchorLeft.parent!.add(clone);
        }
      }
      const lgRight = lastGrindaRight.current;
      const egRight = extraGrindaRight.current;
      if (!frame.getObjectByName('extraGrindaRight') && egRight && lgRight) {
        const anchorRight = frame.getObjectByName(lgRight.name);
        if (anchorRight) {
          const clone = egRight.clone(true);
          clone.name = 'extraGrindaRight';
          clone.userData.isGrinda = true;
          clone.position.copy(egRight.position);
          anchorRight.parent!.add(clone);
        }
      }
    });
  }

  function syncGrinziFor18() {
    const mg = modelsGroup.current;
    if (!mg) return;
    mg.children.forEach((frame, index) => {
      if (index === 0) return;
      const lgLeft = lastGrindaLeft.current;
      const ngLeft = newGrindaLeft.current;
      if (!frame.getObjectByName('newGrindaLeft') && ngLeft && lgLeft) {
        const anchorLeft = frame.getObjectByName(lgLeft.name);
        if (anchorLeft) {
          const clone = ngLeft.clone(true);
          clone.name = 'newGrindaLeft';
          clone.userData.isGrinda = true;
          clone.position.copy(ngLeft.position);
          anchorLeft.parent!.add(clone);
        }
      }
      const lgRight = lastGrindaRight.current;
      const ngRight = newGrindaRight.current;
      if (!frame.getObjectByName('newGrindaRight') && ngRight && lgRight) {
        const anchorRight = frame.getObjectByName(lgRight.name);
        if (anchorRight) {
          const clone = ngRight.clone(true);
          clone.name = 'newGrindaRight';
          clone.userData.isGrinda = true;
          clone.position.copy(ngRight.position);
          anchorRight.parent!.add(clone);
        }
      }
    });
  }

  function syncGrinziBasedOnWidth(new_width: number) {
    if (new_width >= 18) syncGrinziFor18();
    else syncGrinziFor15();
  }

  /** Recalculate & apply the single horizontal Y-axis clipping plane for PereteSTG / PereteDR.
   *  The cut sits at the eave height — the lowest (outer) edge of AcoperisSTG / AcoperisDR.
   *  Uses the same eaveY formula as the PereteFata/PereteSpate clip effect, but bumped up slightly. */
  function applySideClipPlanes(h: number) {
    const mg = modelsGroup.current;
    if (!mg) return;

    // eaveY = the bottom edge of AcoperisSTG/AcoperisDR (roof panel outer edge).
    const cornerLiftOffset = 0.4; // User requested "a bit higher", previous was 0.23, then 0.33
    const eaveY = h + cornerLiftOffset;

    const sp = sideClipPlanes.current;
    sp[0].setComponents(0, -1, 0, eaveY);

    // Track processed materials in this pass to avoid redundant work
    const updatedMaterials = new Set<THREE.Material>();

    // Apply to ALL frames in the modelsGroup to ensure clones are clipped too
    mg.children.forEach((frame) => {
      frame.traverse((child) => {
        if (child instanceof THREE.Mesh && (child.name.includes('PereteSTG') || child.name.includes('PereteDR'))) {
          // Clone material only if it hasn't been cloned specifically for clipping yet
          if (!child.userData.sideClipMatCloned) {
            child.material = (child.material as THREE.Material).clone();
            child.userData.sideClipMatCloned = true;
          }
          
          const mat = child.material as THREE.MeshStandardMaterial;
          if (!updatedMaterials.has(mat)) {
            mat.clippingPlanes = [sp[0]];
            mat.clipShadows = true;
            mat.side = THREE.DoubleSide;
            mat.needsUpdate = true;
            updatedMaterials.add(mat);
          }
        }
      });
    });

    // ── Visual debug helper ──
    if (sideClipHelperRef.current) {
      scene.remove(sideClipHelperRef.current);
    }
    const helper = new THREE.PlaneHelper(sp[0], 30, 0xff6600);
    helper.visible = false;
    scene.add(helper);
    sideClipHelperRef.current = helper;
  }

  // ── One-time setup: parse GLTF scene (mirror of loader.load callback) ─────
  useEffect(() => {
    // Reset all imperative collections so React Strict Mode / effect re-runs match
    // the single-shot `loader.load` behavior in configurator.js (no duplicate meshes).
    resize_height.current = [];
    lowered.current = [];
    threemeters.current = [];
    fourmeters_lower.current = [];
    fivemeters.current = [];
    resize_width.current = [];
    left.current = [];
    right.current = [];
    grinzi.current = [];
    sideWalls.current = [];
    grinziLeft.current = [];
    grinziRight.current = [];
    fourmeters_height.current = 0;
    lastGrindaLeft.current = null;
    lastGrindaRight.current = null;
    extraGrindaLeft.current = null;
    extraGrindaRight.current = null;
    extraGrindaLeftTemplate.current = null;
    extraGrindaRightTemplate.current = null;
    newGrindaLeft.current = null;
    newGrindaRight.current = null;
    newGrindaLeftTemplate.current = null;
    newGrindaRightTemplate.current = null;
    baza_stalp.current = null;
    baza_stalp001.current = null;
    suruburi_sus001.current = null;
    suruburi_sus002.current = null;
    plane_sus_1.current = null;
    plane_sus_2.current = null;
    baseModel.current = null;
    modelsGroup.current = null;
    ok.current = true;
    currentRise.current = 0;

    const model = gltfScene.clone(true);
    model.position.set(0, 0, 0);

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;

      // const material = new THREE.MeshStandardMaterial({
      //   ...metalTextures,
      //   metalness: 0.8, // Force it to look like real metal
      //   roughness: 0.7, // Adjust this to make it shinier (0.1) or duller (0.9)
      // });

      // child.geometry.computeBoundingBox();
      // const box = child.geometry.boundingBox!;
      // const size = new THREE.Vector3();
      // box.getSize(size);

      // size.multiply(child.scale);

      // const maxDim = Math.max(size.x, size.y, size.z);

      // // Calculate how many times to repeat. Increase the multiplier (e.g., 3 or 4) if the scratches look too big.
      // const repeatValue = maxDim * 5; 

      // // FIX: Clone ALL maps so Color, Normal, Roughness, and Metalness stay perfectly synced
      // const textureMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'];
      // textureMaps.forEach((mapName) => {
      //   // We have to use 'as any' here briefly to bypass TypeScript's strict indexing on materials
      //   if ((material as any)[mapName]) {
      //     (material as any)[mapName] = (material as any)[mapName].clone();
      //     // Uniform tiling stops stretching regardless of which way the UVs are rotated
      //     (material as any)[mapName].repeat.set(repeatValue, repeatValue);
      //     (material as any)[mapName].needsUpdate = true;
      //   }
      // });

      // child.material = material;

      // if (child.name === 'Plane002' || child.name === 'Plane003') {
      //   child.material = new THREE.MeshStandardMaterial({
      //     ...wallTextures,
      //     color: new THREE.Color('#9ca3af'),
      //     normalScale: new THREE.Vector2(1.5, 1.5), // Default grey, can be changed later
      //     metalness: 0.6,
      //     roughness: 0.4,
      //   });

      //   // Ensure the wall texture scales with the height of the building
      //   // heightRef.current / 6 ensures the texture doesn't stretch when the wall grows
      //   const scaleY = heightRef.current / 6;
      //   child.material.map.repeat.set(10, 1 * scaleY);
      //   child.material.normalMap.repeat.set(10, 1 * scaleY);
      // }

      if (child.name === 'beton') {
        // 1. Ensure the material actually uses the textures from your foundationTextures object
        child.userData.initialScaleX = child.scale.x;
        child.material = new THREE.MeshStandardMaterial({
          map: foundationTextures.map, // Make sure these property names match your loader
          normalMap: foundationTextures.normalMap,
          roughnessMap: foundationTextures.roughnessMap,
          color: new THREE.Color('#8a8a8a'), // Slightly darker concrete looks more realistic
          roughness: 0.9,
          metalness: 0.0,
          normalScale: new THREE.Vector2(1.5, 1.5) // Bumped up for more grit
        });

        // 2. Tiling logic
        // If the floor is 12x12 (as per your screenshot), we want it to tile in BOTH directions
        const repeatX = (width || 12) / 2;  // Repeat every 2 meters
        const repeatY = (length || 12) / 2;

        // 3. APPLY TO ALL MAPS
        // This is the most common point of failure: all maps must share the same tiling
        const activeMaps = ['map', 'normalMap', 'roughnessMap'];
        activeMaps.forEach(mapName => {
          const texture = child.material[mapName];
          if (texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(repeatX, repeatY);
            texture.needsUpdate = true;
          }
        });
      }

      if (child.name === 'suruburi_laterale008') {
        lastGrindaLeft.current = child;
        extraGrindaLeftTemplate.current = child;
        newGrindaLeftTemplate.current = child;
      }
      if (child.name === 'suruburi_laterale017') {
        lastGrindaRight.current = child;
        extraGrindaRightTemplate.current = child;
        newGrindaRightTemplate.current = child;
      }

      if (child.name === 'baza_stalp' || child.name === 'stalp_sus_1' || child.name === 'suruburi_sus001') {
        left.current.push(child);
      }
      if (child.name === 'baza_stalp001' || child.name === 'stalp_sus' || child.name === 'suruburi_sus002') {
        right.current.push(child);
      }

      if (['suruburi_laterale005', 'suruburi_laterale006', 'suruburi_laterale007', 'suruburi_laterale008'].includes(child.name)) {
        grinziLeft.current.push(child);
        child.userData.initialX = child.position.x;
        child.userData.initialY = child.position.y;
      }
      if (['suruburi_laterale014', 'suruburi_laterale015', 'suruburi_laterale016', 'suruburi_laterale017'].includes(child.name)) {
        grinziRight.current.push(child);
        child.userData.initialX = child.position.x;
        child.userData.initialY = child.position.y;
      }

      if (child.name === 'stalp_1' || child.name === 'stalp_2') {
        resize_height.current.push(child);
        child.children.forEach(subChild => {
          subChild.userData.initialLocalY = subChild.position.y;
        });
      }

      if ([
        'suruburi_sus001', 'suruburi_sus002', 'aripa_lateral', 'plane_aripioara001',
        'suruburi_sus', 'aripioara_sustinere_sus', 'aripioara_lateral', 'plane_aripioara',
        'suruburi_sus003', 'aripioara_sustinere_sus002', 'plane_sus_1', 'plane_sus_2',
      ].includes(child.name)) {
        lowered.current.push(child);
        child.userData.initialY = child.position.y;
      }

      if (['suruburi_laterale002', 'suruburi_laterale003', 'suruburi_laterale011', 'suruburi_laterale012'].includes(child.name)) {
        threemeters.current.push(child);
      }
      if (child.name === 'suruburi_laterale002' || child.name === 'suruburi_laterale011') {
        fourmeters_lower.current.push(child);
      }
      if (child.name === 'suruburi_laterale003' || child.name === 'suruburi_laterale012') {
        fivemeters.current.push(child);
      }

      if (child.name === 'stalp_sus' || child.name === 'stalp_sus_1') {
        resize_width.current.push(child);
        child.userData.initialX = child.position.x;
        child.userData.initialY = child.position.y;
        const geom = child.geometry;
        geom.computeBoundingBox();
        const box = geom.boundingBox!;
        child.userData.localLength = box.max.x - box.min.x;
      }

      if (child.name === 'baza_stalp') {
        baza_stalp.current = child;
        child.userData.initialX = child.position.x;
      }
      if (child.name === 'baza_stalp001') {
        baza_stalp001.current = child;
        child.userData.initialX = child.position.x;
      }
      if (child.name === 'suruburi_sus001') {
        suruburi_sus001.current = child;
        child.userData.initialX = child.position.x;
      }
      if (child.name === 'suruburi_sus002') {
        suruburi_sus002.current = child;
        child.userData.initialX = child.position.x;
      }
      if (child.name === 'plane_sus_1') {
        plane_sus_1.current = child;
        child.userData.initialY = child.position.y;
      }
      if (child.name === 'plane_sus_2') {
        plane_sus_2.current = child;
        child.userData.initialY = child.position.y;
      }
      if (child.name.includes('Grinda')) {
        child.userData.isGrinda = true;
        grinzi.current.push(child);
      }
      // Mark spate objects for custom visibility handling
      if (child.name === 'burlan_spateSTG' || child.name === 'burlan_spateDR' ||
        child.name === 'jgheab_spateSTG' || child.name === 'jgheab_spateDR') {
        child.userData.isSpateMesh = true;
      }
      // End-closure wall meshes (one per side); hidden on the last frame like grinzi
      if (child.name === 'PereteSTG' || child.name === 'PereteDR' || child.name === 'AcoperisSTG' || child.name === 'AcoperisDR' ||
        child.name === 'beton' || child.name === 'jgheabSTG' || child.name === 'jgheabDR' || child.name === 'coltar_acoperis') {
        child.userData.isLastFrameWall = true;
      }

      // Collect side walls — reparented AFTER traverse to avoid mutating the scene graph mid-iteration.
      if (child.name === 'PereteSTG' || child.name === 'PereteDR') {
        sideWalls.current.push(child);
      }


      if (['PereteSTG', 'PereteDR', 'AcoperisSTG', 'AcoperisDR'].includes(child.name)) {
        // Create a duplicate mesh using the exact same geometry and material
        const innerSkin = new THREE.Mesh(child.geometry, child.material);
        innerSkin.name = child.name + '_inner';

        // Attach it to the main wall so it moves/scales exactly when the hall resizes
        child.add(innerSkin);
      }
    });

    // Reparent PereteSTG/PereteDR to model root AFTER traverse completes.
    // stalp_1/stalp_2 (their GLTF parents) are scaled by resize_height, which would
    // corrupt any position.y we set on the walls. Detaching breaks that link.
    sideWalls.current.forEach(mesh => {
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      model.attach(mesh); // reparent, preserving world transform
      mesh.position.copy(worldPos); // restore position in new parent space
      mesh.userData.sideWallBaseY = mesh.position.y; // anchor Y at model_height=6
      mesh.userData.initialX = mesh.position.x;      // anchor X for width slider
      mesh.userData.initialScaleY = mesh.scale.y;    // GLTF native scale (usually 1)

      // Add to left/right arrays so the width slider moves them correctly
      if (mesh.name === 'PereteSTG') left.current.push(mesh);
      if (mesh.name === 'PereteDR')  right.current.push(mesh);
    });


    // Apply initial height = 3
    const initial_height = 3;
    const scale = initial_height / model_height;
    initial_scale.current = scale;

    // Side walls: keep at natural GLTF size — clipping planes trim the top to the roof shape.
    // Just lock position.y to the captured world anchor so they don't drift.
    sideWalls.current.forEach(mesh => {
      mesh.position.y = mesh.userData.sideWallBaseY;
    });

    resize_height.current.forEach(mesh => {
      mesh.scale.y = scale;
      mesh.children.forEach(subChild => {
        if (subChild.userData.initialLocalY !== undefined) {
          const TWEAK_LATERAL_Y = 0.03; // Increase this if the gap is still visible
          subChild.position.y = (subChild.userData.initialLocalY / scale) + TWEAK_LATERAL_Y;
        }
      });
    });
    lowered.current.forEach(obj => {

      obj.position.y = -initial_height;

      obj.userData.initialY = obj.position.y;

    });
    resize_width.current.forEach(obj => {
      obj.position.y = obj.userData.initialY / 2 + 0.0386;
      obj.userData.initialY = obj.position.y;
    });
    threemeters.current.forEach(obj => { if (obj.parent) obj.visible = false; });
    fourmeters_lower.current.forEach(obj => { fourmeters_height.current = obj.position.y; });

    // Build modelsGroup
    const mg = new THREE.Group();
    modelsGroup.current = mg;
    baseModel.current = model;
    model.userData.isBase = true;
    mg.add(model);

    // Initial length = 12 → 3 frames (index 0,1,2)
    const initialCount = Math.floor(12 / distanceLength) + 1;
    for (let i = 1; i < initialCount; i++) {
      const clone = model.clone(true);
      clone.position.z = -i * distanceLength;
      mg.add(clone);
    }

    updateLastFrameBeams();
    updateSpateVisibility();

    // Apply side-wall eave clip plane immediately — sideWalls.current is populated here.
    applySideClipPlanes(height);

    return () => { mg.removeFromParent(); };
  }, [gltfScene]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── HEIGHT slider ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!baseModel.current || !modelsGroup.current) return;
    if (prevHeight.current === height) return;
    prevHeight.current = height;

    const new_height = height;
    const scale = new_height / model_height;
    // Side walls: position is fixed — clipping planes handle roof trimming.
    // No scale.y change needed since they are no longer pillar children.
    sideWalls.current.forEach(mesh => {
      mesh.position.y = mesh.userData.sideWallBaseY;
    });

    resize_height.current.forEach(mesh => {
      mesh.scale.y = scale;
      // Counteract the parent scale shift on the child's local position
      mesh.children.forEach(subChild => {
        if (subChild.userData.initialLocalY !== undefined) {
          // Inverse scale so the wall's anchor position doesn't move relative to the floor
          subChild.position.y = subChild.userData.initialLocalY / scale;
        }
      });
    });
    const deltaHeight = (scale - initial_scale.current) * model_height;
    lowered.current.forEach(obj => { obj.position.y = obj.userData.initialY + deltaHeight; });
    resize_width.current.forEach(obj => { obj.position.y = obj.userData.initialY + deltaHeight; });

    const p1 = plane_sus_1.current;
    const p2 = plane_sus_2.current;
    if (p1 && p2) {
      p1.position.y = p1.userData.initialY + deltaHeight + currentRise.current;
      p2.position.y = p2.userData.initialY + deltaHeight + currentRise.current;
    }

    if (new_height === 3) {
      threemeters.current.forEach(obj => { if (obj.parent) obj.visible = false; });
    } else if (new_height === 4) {
      fourmeters_lower.current.forEach(obj => {
        obj.position.y = fourmeters_height.current;
        obj.visible = true;
        obj.position.y -= 0.3;
        ok.current = true;
      });
      fivemeters.current.forEach(obj => { if (obj.parent) obj.visible = false; });
    } else if (new_height === 5) {
      if (ok.current) {
        fourmeters_lower.current.forEach(obj => {
          obj.position.y += 0.3;
          ok.current = false;
        });
      }
      fivemeters.current.forEach(obj => { if (obj.parent) obj.visible = false; });
    } else {
      threemeters.current.forEach(obj => { obj.visible = true; });
    }

    // Sync clones
    const mg = modelsGroup.current;
    const bm = baseModel.current;
    mg.children.forEach((child, i) => {
      if (i > 0) {
        child.traverse((mesh) => {
          if (mesh instanceof THREE.Mesh) {
            const baseMesh = bm.getObjectByName(mesh.name) as THREE.Mesh | undefined;
            if (baseMesh) {
              mesh.scale.copy(baseMesh.scale);
              mesh.rotation.copy(baseMesh.rotation);
              mesh.position.copy(baseMesh.position);
              if (!baseMesh.userData.isGrinda && !baseMesh.userData.isLastFrameWall && !baseMesh.userData.isSpateMesh) {
                mesh.visible = baseMesh.visible;
              }
            }
          }
        });
      }
    });
    updateLastFrameBeams();
  }, [height]);

  // ── LENGTH slider ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!baseModel.current || !modelsGroup.current) return;
    if (prevLength.current === length) return;
    prevLength.current = length;

    const newLength = length;
    const requiredCount = Math.floor(newLength / distanceLength) + 1;
    const mg = modelsGroup.current;
    const bm = baseModel.current;

    while (mg.children.length > requiredCount) {
      mg.remove(mg.children[mg.children.length - 1]);
    }
    for (let i = mg.children.length; i < requiredCount; i++) {
      const clone = bm.clone(true);
      clone.position.z = -i * distanceLength;
      mg.add(clone);
    }

    updateCamera(newLength);
    updateLastFrameBeams();
    updateSpateVisibility();
  }, [length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WIDTH slider ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!baseModel.current || !modelsGroup.current) return;
    if (prevWidth.current === width) return;
    prevWidth.current = width;

    const new_width = width;

    const half_new = new_width / 2;
    const half_initial = model_width / 2;
    const scaleX = half_new / half_initial;
    const delta = half_new - half_initial;
    const widthDelta = new_width - initial_width;

    const THRESHOLD = 12;
    let pullMain = 0;
    let pullStalp = 0;
    if (new_width > THRESHOLD) {
      const excess = new_width - THRESHOLD;
      pullMain = excess * 0.484;
      pullStalp = pullMain;
    } else {
      const deficit = THRESHOLD - new_width;
      pullMain = -deficit * 0.487;
      pullStalp = pullMain * 0.987;
    }

    const bs = baza_stalp.current;
    const bs1 = baza_stalp001.current;
    const ss1 = suruburi_sus001.current;
    const ss2 = suruburi_sus002.current;

    if (bs && bs1 && ss1 && ss2) {
      bs.position.x = bs.userData.initialX - delta;
      ss1.position.x = ss1.userData.initialX - delta;
      bs1.position.x = bs1.userData.initialX + delta;
      ss2.position.x = ss2.userData.initialX + delta;
    }

    let rise = 0;
    if (new_width >= midWidth) {
      const t = (new_width - midWidth) / (maxWidth - midWidth);
      rise = t * maxrise;
    } else {
      const t = (midWidth - new_width) / (midWidth - minWidth);
      rise = t * minrise;
    }
    currentRise.current = rise;

    const lgLeft = lastGrindaLeft.current;
    const lgRight = lastGrindaRight.current;

    // Remove last grinzi when width <= 9
    if (new_width <= 9 && lgLeft && grinziLeft.current.includes(lgLeft)) {
      lgLeft.parent?.remove(lgLeft);
      grinziLeft.current = grinziLeft.current.filter(m => m !== lgLeft);
      lgRight!.parent?.remove(lgRight!);
      grinziRight.current = grinziRight.current.filter(m => m !== lgRight);

      modelsGroup.current?.children.forEach((frame, index) => {
        if (index === 0) return;
        const l = frame.getObjectByName(lgLeft.name);
        if (l?.parent) l.parent.remove(l);
        const r = frame.getObjectByName(lgRight!.name);
        if (r?.parent) r.parent.remove(r);
      });
    }

    // Re-add last grinzi when width > 9
    if (new_width > 9 && lgLeft && !grinziLeft.current.includes(lgLeft)) {
      const parentLeft = grinziLeft.current[0]?.parent;
      if (parentLeft) { parentLeft.add(lgLeft); grinziLeft.current.push(lgLeft); }
      const parentRight = grinziRight.current[0]?.parent;
      if (parentRight) { parentRight.add(lgRight!); grinziRight.current.push(lgRight!); }

      modelsGroup.current?.children.forEach((frame, index) => {
        if (index === 0) return;
        const anchorLeft = frame.getObjectByName(grinziLeft.current[0].name);
        if (anchorLeft && !frame.getObjectByName(lgLeft.name)) {
          anchorLeft.parent!.add(lgLeft.clone(true));
        }
        const anchorRight = frame.getObjectByName(grinziRight.current[0].name);
        if (anchorRight && !frame.getObjectByName(lgRight!.name)) {
          anchorRight.parent!.add(lgRight!.clone(true));
        }
      });
    }

    // Small-width grinzi positioning (8–11)
    if ([8, 9, 10, 11].includes(new_width)) {
      const move = widthDelta / 8.3;
      let moveFactor = move;
      let riseFactorRight = rise * 0.255;
      let riseFactorLeft = rise * 0.255;
      if (new_width === 9) {
        moveFactor = move * -0.09; riseFactorRight = rise * -0.0295; riseFactorLeft = rise * -0.026;
      } else if (new_width === 8) {
        moveFactor = move * 0.26; riseFactorRight = rise * 0.0627; riseFactorLeft = rise * 0.0658;
      }
      grinziLeft.current.forEach((g, i) => {
        g.position.x = g.userData.initialX + (i + 1) * moveFactor;
        g.position.y = g.userData.initialY + (i + 1) * riseFactorLeft;
      });
      grinziRight.current.forEach((g, i) => {
        g.position.x = g.userData.initialX - (i + 1) * moveFactor;
        g.position.y = g.userData.initialY + (i + 1) * riseFactorRight;
      });
    }

    // Add extraGrinda pair at width >= 15
    const eglt = extraGrindaLeftTemplate.current;
    const egrt = extraGrindaRightTemplate.current;
    if (new_width >= 15 && !extraGrindaLeft.current && eglt && !extraGrindaRight.current && egrt) {
      const egl = eglt.clone(true);
      egl.position.copy(lgLeft!.position);
      egl.position.x += DeltaX * 0.315;
      egl.position.y += DeltaY * 0.315;
      egl.userData.initialX = egl.position.x;
      egl.userData.initialY = egl.position.y;
      egl.name = 'extraGrindaLeft';
      eglt.parent!.add(egl);
      grinziLeft.current.push(egl);
      extraGrindaLeft.current = egl;

      const egr = egrt.clone(true);
      egr.position.copy(lgRight!.position);
      egr.position.x -= DeltaX * 0.315;
      egr.position.y += DeltaY * 0.315;
      egr.userData.initialX = egr.position.x;
      egr.userData.initialY = egr.position.y;
      egr.name = 'extraGrindaRight';
      egrt.parent!.add(egr);
      grinziRight.current.push(egr);
      extraGrindaRight.current = egr;

      syncGrinziBasedOnWidth(new_width);
    }

    // Remove extraGrinda pair at width < 15
    if (new_width < 15 && extraGrindaLeft.current && extraGrindaRight.current) {
      extraGrindaLeft.current.parent?.remove(extraGrindaLeft.current);
      grinziLeft.current = grinziLeft.current.filter(m => m !== extraGrindaLeft.current);
      extraGrindaLeft.current = null;

      extraGrindaRight.current.parent?.remove(extraGrindaRight.current);
      grinziRight.current = grinziRight.current.filter(m => m !== extraGrindaRight.current);
      extraGrindaRight.current = null;

      modelsGroup.current?.children.forEach((frame, index) => {
        if (index === 0) return;
        const l = frame.getObjectByName('extraGrindaLeft');
        if (l?.parent) l.parent.remove(l);
        const r = frame.getObjectByName('extraGrindaRight');
        if (r?.parent) r.parent.remove(r);
      });
    }

    // Add newGrinda pair at width >= 18
    const nglt = newGrindaLeftTemplate.current;
    const ngrt = newGrindaRightTemplate.current;
    if (new_width >= 18 && !newGrindaLeft.current && !newGrindaRight.current && nglt && ngrt) {
      const ngl = nglt.clone(true);
      ngl.position.copy(lgLeft!.position);
      ngl.position.x += DeltaX * 1.383;
      ngl.position.y += DeltaY * 1.4;
      ngl.userData.initialX = ngl.position.x;
      ngl.userData.initialY = ngl.position.y;
      ngl.name = 'newGrindaLeft';
      nglt.parent!.add(ngl);
      grinziLeft.current.push(ngl);
      newGrindaLeft.current = ngl;

      const ngr = ngrt.clone(true);
      ngr.position.copy(lgRight!.position);
      ngr.position.x -= DeltaX * 1.383;
      ngr.position.y += DeltaY * 1.4;
      ngr.userData.initialX = ngr.position.x;
      ngr.userData.initialY = ngr.position.y;
      ngr.name = 'newGrindaRight';
      ngrt.parent!.add(ngr);
      grinziRight.current.push(ngr);
      newGrindaRight.current = ngr;

      syncGrinziBasedOnWidth(new_width);
    }

    // Remove newGrinda pair at width < 18
    if (new_width < 18 && newGrindaLeft.current && newGrindaRight.current) {
      newGrindaLeft.current.parent?.remove(newGrindaLeft.current);
      grinziLeft.current = grinziLeft.current.filter(m => m !== newGrindaLeft.current);
      newGrindaLeft.current = null;

      newGrindaRight.current.parent?.remove(newGrindaRight.current);
      grinziRight.current = grinziRight.current.filter(m => m !== newGrindaRight.current);
      newGrindaRight.current = null;

      modelsGroup.current?.children.forEach((frame, index) => {
        if (index === 0) return;
        const l = frame.getObjectByName('newGrindaLeft');
        if (l?.parent) l.parent.remove(l);
        const r = frame.getObjectByName('newGrindaRight');
        if (r?.parent) r.parent.remove(r);
      });
    }

    // Large-width grinzi positioning (13–14, 16–17, 19–20)
    if (
      (new_width > initial_width && new_width <= 14) ||
      (new_width >= 16 && new_width <= 17) ||
      (new_width >= 19 && new_width <= maxWidth)
    ) {
      const move = widthDelta / 8.3;
      let moveFactor: number = (new_width - 15) / 10.3;
      const riseFactor: number = (new_width - 15) / 58;
      let riseFactorRight: number;
      let riseFactorLeft: number;

      if (new_width > initial_width && new_width <= 14) {
        moveFactor = move;
        riseFactorRight = rise * 0.255;
        riseFactorLeft = rise * 0.255;
      } else if (new_width >= 19 && new_width <= 20) {
        moveFactor = (new_width - 18) / 12.4;
        riseFactorRight = (new_width - 18) / 70;
        riseFactorLeft = riseFactorRight;
      } else {
        riseFactorRight = riseFactor;
        riseFactorLeft = riseFactor;
      }

      grinziLeft.current.forEach((g, i) => {
        g.position.x = g.userData.initialX + (i + 1) * moveFactor;
        g.position.y = g.userData.initialY + (i + 1) * riseFactorLeft;
      });
      grinziRight.current.forEach((g, i) => {
        g.position.x = g.userData.initialX - (i + 1) * moveFactor;
        g.position.y = g.userData.initialY + (i + 1) * riseFactorRight;
      });
    }

    // Reset grinzi to initial positions on exact "clean" widths
    grinziLeft.current.forEach(mesh => {
      if (new_width === 15 || new_width === 12 || new_width === 18) {
        mesh.position.x = mesh.userData.initialX;
        mesh.position.y = mesh.userData.initialY + rise * 0.01;
      }
    });
    grinziRight.current.forEach(mesh => {
      if (new_width === 15 || new_width === 12 || new_width === 18) {
        mesh.position.x = mesh.userData.initialX;
        mesh.position.y = mesh.userData.initialY + rise * 0.01;
      }
    });

    // Resize width meshes + tilt roof
    resize_width.current.forEach(mesh => {
      mesh.scale.x = scaleX;
      const localLen = (mesh.userData.localLength || 1) * mesh.scale.x;
      const angle = Math.atan2(rise, localLen);

      if (mesh.name.includes('stalp_sus_1')) {
        mesh.position.x = mesh.userData.initialX - delta;
        mesh.rotation.z = angle;
      } else {
        mesh.position.x = mesh.userData.initialX + delta;
        mesh.rotation.z = -angle;
      }
      const p1 = plane_sus_1.current;
      const p2 = plane_sus_2.current;
      const sc = heightRef.current / model_height;
      const dh = (sc - initial_scale.current) * model_height;
      if (p1 && p2) {
        p1.position.y = p1.userData.initialY + dh + rise;
        p2.position.y = p2.userData.initialY + dh + rise;
      }
    });

    const betonBase = baseModel.current.getObjectByName('beton') as THREE.Mesh;
    if (betonBase) {
      // FIX: Multiply our slider ratio by the mesh's original starting scale
      betonBase.scale.x = betonBase.userData.initialScaleX * scaleX;

      // 2. Adjust the texture tiling immediately so it doesn't stretch
      const activeMaps = ['map', 'normalMap', 'roughnessMap'];
      activeMaps.forEach(mapName => {
        const texture = (betonBase.material as any)[mapName];
        if (texture) {
          texture.repeat.set(new_width / 2, length / 2);
          texture.needsUpdate = true;
        }
      });
    }

    left.current.forEach(mesh => {
      const isStalpSus = mesh.name === 'stalp_sus' || mesh.name === 'stalp_sus_1';
      mesh.position.x = mesh.userData.initialX - (isStalpSus ? pullStalp : pullMain);
    });
    right.current.forEach(mesh => {
      const isStalpSus = mesh.name === 'stalp_sus' || mesh.name === 'stalp_sus_1';
      mesh.position.x = mesh.userData.initialX + (isStalpSus ? pullStalp : pullMain);
    });

    // Sync all clones to match base model
    const mg = modelsGroup.current;
    const bm = baseModel.current;
    mg?.children.forEach((child, i) => {
      if (i > 0) {
        child.traverse(mesh => {
          if (mesh instanceof THREE.Mesh) {
            const baseMesh = bm?.getObjectByName(mesh.name) as THREE.Mesh | undefined;
            if (baseMesh) {
              mesh.scale.copy(baseMesh.scale);
              mesh.rotation.copy(baseMesh.rotation);
              mesh.position.copy(baseMesh.position);
              if (!baseMesh.userData.isGrinda && !baseMesh.userData.isLastFrameWall && !baseMesh.userData.isSpateMesh) {
                mesh.visible = baseMesh.visible;
              }
            }
          }
        });
      }
    });

    updateLastFrameBeams();
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps


  /**
   * Update clipping planes using PURE world geometry.
   * No mesh positions are read. It relies entirely on the slider values.
   */
  useEffect(() => {
    const mg = modelsGroup.current;
    if (!mg) return;

    // ── 1. The Mathematical Truth of the Hall ──
    const THRESHOLD = 12;
    let pullMain = 0;
    if (width > THRESHOLD) {
      pullMain = (width - THRESHOLD) * 0.484;
    } else {
      pullMain = -(THRESHOLD - width) * 0.487;
    }

    // The columns start at 6m half-width, plus the offset
    const structuralHalfW = 6 + pullMain;

    // The base roof pitch derived directly from your Blender model (7389mm - 6104mm)
    const baseRise = 1.285;

    const cornerLiftOffset = 0.23;

    const eaveY = height + cornerLiftOffset;
    const peakY = height + baseRise + currentRise.current;

    // Small buffers so the cut sits slightly outside the steel beams
    const extraWidth = 0.41;
    const extraHeight = 0.26;

    const planes = clipPlanes.current;
    const limitX = structuralHalfW + extraWidth;

    // ── 2. Build the 4 clipping planes ──

    // Plane 0 – Left vertical cut
    planes[0].setComponents(1, 0, 0, limitX);

    // Plane 1 – Right vertical cut
    planes[1].setComponents(-1, 0, 0, limitX);

    // Plane 2 – Left Roof Slope
    const dxL = structuralHalfW;
    const dyL = peakY - eaveY;
    // Normal pointing down and right (into the hall)
    const normalL = new THREE.Vector3(dyL, -dxL, 0).normalize();
    const planePointL = new THREE.Vector3(0, peakY + extraHeight, 0);
    planes[2].set(normalL, -normalL.dot(planePointL));

    // Plane 3 – Right Roof Slope
    const dxR = -structuralHalfW;
    const dyR = peakY - eaveY;
    // Normal pointing down and left (into the hall)
    const normalR = new THREE.Vector3(-dyR, dxR, 0).normalize();
    const planePointR = new THREE.Vector3(0, peakY + extraHeight, 0);
    planes[3].set(normalR, -normalR.dot(planePointR));

    // ── 3. Apply these planes and handle visibility ──
    // ── 3. Apply these planes and handle visibility ──
    const totalFrames = mg.children.length;
    mg.children.forEach((frame, index) => {
      const isFirst = index === 0;
      const isLast = index === totalFrames - 1;

      const pf = frame.getObjectByName('PereteFata') as THREE.Mesh | undefined;
      if (pf) {
        pf.visible = isFirst;
        if (pf.visible) {

          // ── REAL FIX: PRESERVE BLENDER SCALE WHILE UN-SQUASHING ──
          if (pf.userData.initialScaleY === undefined) {
            pf.userData.initialScaleX = pf.scale.x;
            pf.userData.initialScaleY = pf.scale.y; // Saves your 1.195!
            pf.userData.initialScaleZ = pf.scale.z;
          }
          const pScaleY = pf.parent ? pf.parent.scale.y : 1;
          pf.scale.set(
            pf.userData.initialScaleX,
            pf.userData.initialScaleY / pScaleY,
            pf.userData.initialScaleZ
          );
          // ─────────────────────────────────────────────────────────

          if (!pf.userData.clipMatCloned) {
            pf.material = (pf.material as THREE.Material).clone();
            pf.userData.clipMatCloned = true;
          }
          const mat = pf.material as THREE.MeshStandardMaterial;
          mat.clippingPlanes = planes;
          mat.clipShadows = true;
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      }

      // PereteSpate: visible only on the LAST frame
      const ps = frame.getObjectByName('PereteSpate') as THREE.Mesh | undefined;
      if (ps) {
        ps.visible = isLast;
        if (ps.visible) {
          if (ps.userData.initialScaleY === undefined) {
            ps.userData.initialScaleX = ps.scale.x;
            ps.userData.initialScaleY = ps.scale.y;
            ps.userData.initialScaleZ = ps.scale.z;
          }
          const pScaleY = ps.parent ? ps.parent.scale.y : 1;
          ps.scale.set(
            ps.userData.initialScaleX,
            ps.userData.initialScaleY / pScaleY,
            ps.userData.initialScaleZ
          );
          if (!ps.userData.clipMatCloned) {
            ps.material = (ps.material as THREE.Material).clone();
            ps.userData.clipMatCloned = true;
          }
          const mat = ps.material as THREE.MeshStandardMaterial;
          mat.clippingPlanes = planes;
          mat.clipShadows = true;
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      }

    });

    // burlan_spate* and jgheab_spate*: visible only on the SECOND-TO-LAST frame
    updateSpateVisibility();

  }, [width, height, length]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Side-wall eave clipping: update when height, width or length changes ─────
  useEffect(() => {
    if (!modelsGroup.current) return;
    applySideClipPlanes(height);
  }, [height, width, length]); // eslint-disable-line react-hooks/exhaustive-deps




  useEffect(() => {
    if (!baseModel.current || !modelsGroup.current) return;

    const toggleConcrete = (modelTarget: THREE.Object3D) => {
      modelTarget.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.name.includes('beton')) {
            child.visible = showFoundation;
          }
        }
      });
    };

    toggleConcrete(baseModel.current);
    modelsGroup.current.children.forEach(toggleConcrete);
  }, [showFoundation]);

  useEffect(() => {
    if (!baseModel.current || !modelsGroup.current) return;

    // Convert your slider (mm) to Three.js world units (meters) -> 250mm = 0.25
    const gapDistance = isIsolated ? (-insulation / 1000) : 0;

    const applySandwichGap = (modelTarget: THREE.Object3D) => {
      modelTarget.traverse((child) => {

        // Target the duplicates we created in the setup
        if (child.name.endsWith('_inner')) {

          // Hide the inner skin entirely if insulation is toggled off
          child.visible = isIsolated;

          // Push the inner skin inward to create the thickness.
          // IMPORTANT: If the inner wall moves sideways or up instead of inward towards the center of the hall, 
          // change 'x' to 'y' or 'z' below to match your Blender local axes!

          if (child.name.includes('PereteSTG')) child.position.x = gapDistance;
          if (child.name.includes('PereteDR')) child.position.x = -gapDistance;

          // Roofs often use Y or Z depending on how you rotated them in Blender
          if (child.name.includes('AcoperisSTG')) child.position.y = -gapDistance;
          if (child.name.includes('AcoperisDR')) child.position.y = -gapDistance;
        }
      });
    };

    applySandwichGap(baseModel.current);
    modelsGroup.current.children.forEach(applySandwichGap);
  }, [isIsolated, insulation]);

  // 2. NOW WE CAN DO THE EARLY RETURN
  // Inject modelsGroup into the R3F scene as an imperative primitive (built in useEffect).
  // eslint-disable-next-line react-hooks/refs -- R3F <primitive>: group is attached in GLTF useEffect
  if (!modelsGroup.current) return null;

  return <primitive object={modelsGroup.current} />;
}




// ─── Slider UI overlay (replaces the HTML sliders) ───────────────────────────
interface SlidersProps {
  height: number; setHeight: (v: number) => void;
  width: number; setWidth: (v: number) => void;
  length: number; setLength: (v: number) => void;
  showFoundation: boolean; setShowFoundation: (v: boolean) => void;
  isIsolated: boolean; setIsIsolated: (v: boolean) => void;
  insulation: number; setInsulation: (v: number) => void;
}

function Sliders({ height, setHeight, width, setWidth, length, setLength, showFoundation
  , setShowFoundation, isIsolated, setIsIsolated, insulation, setInsulation }: SlidersProps) {
  // Helper for synchronized input & slider updates
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: number) => void, min: number, max: number) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;

    // Clamping the value to prevent breaking the model
    val = Math.max(min, Math.min(max, val));

    setter(val);
  };

  return (
    <div style={{ padding: '1rem' }} className="absolute backdrop-blur-lg bg-black/40 rounded-2xl z-10 bottom-4 left-4 right-4 md:bottom-auto md:top-5 md:left-5 md:right-auto md:w-96 border-t-4 border-[#F5A623] text-gray-200 shadow-2xl shadow-black/70 flex flex-col gap-4 transition-all">

      <h3 className="m-0 text-lg text-white font-semibold">Configurator Hală</h3>

      {/* Înălțime */}
      <div className="flex items-center gap-3">
        <span className="min-w-[64px] text-lg font-medium">Înălțime</span>
        <input
          type="range" min={3} max={6} step={1} value={height}
          className="flex-1 accent-[#F5A623] cursor-pointer"
          onChange={e => setHeight(parseInt(e.target.value, 10))}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number" value={height} min={3} max={6}
            className="w-12 p-1.5 bg-[#1A1C20]/60 border border-gray-600 focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623] outline-none text-white rounded text-center font-bold transition-all"
            onChange={e => handleInputChange(e, setHeight, 3, 6)}
          />
          <span className="text-sm text-gray-400 w-3">m</span>
        </div>
      </div>

      {/* Lățime */}
      <div className="flex items-center gap-3">
        <span className="min-w-[64px] text-lg font-medium">Lățime</span>
        <input
          type="range" min={8} max={20} step={1} value={width}
          className="flex-1 accent-[#F5A623] cursor-pointer"
          onChange={e => setWidth(parseInt(e.target.value, 10))}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number" value={width} min={8} max={20}
            className="w-12 p-1.5 bg-[#1A1C20]/60 border border-gray-600 focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623] outline-none text-white rounded text-center font-bold transition-all"
            onChange={e => handleInputChange(e, setWidth, 8, 20)}
          />
          <span className="text-sm text-gray-400 w-3">m</span>
        </div>
      </div>

      {/* Lungime */}
      <div className="flex items-center gap-3">
        <span className="min-w-[64px] text-lg font-medium">Lungime</span>
        <input
          type="range" min={12} max={102} step={6} value={length}
          className="flex-1 accent-[#F5A623] cursor-pointer"
          onChange={e => setLength(parseInt(e.target.value, 10))}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number" value={length} min={12} max={102} step={6}
            className="w-12 p-1.5 bg-[#1A1C20]/60 border border-gray-600 focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623] outline-none text-white rounded text-center font-bold transition-all"
            onChange={e => handleInputChange(e, setLength, 12, 102)}
          />
          <span className="text-sm text-gray-400 w-3">m</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/10">
        <span className="text-lg font-medium text-white">Fundație beton</span>
        <button
          onClick={() => setShowFoundation(!showFoundation)}
          className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none ${showFoundation ? 'bg-[#F5A623]' : 'bg-gray-600'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${showFoundation ? 'translate-x-7' : 'translate-x-1'}`}
          />
        </button>
      </div>

      {/* Izolație Toggle */}
      <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/10">
        <span className="text-lg font-medium text-white">Izolație Panouri</span>
        <button
          onClick={() => setIsIsolated(!isIsolated)}
          className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none ${isIsolated ? 'bg-[#F5A623]' : 'bg-gray-600'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${isIsolated ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Conditional Grosime Slider (Only shows if Izolatie is ON) */}
      {isIsolated && (
        <div className="flex items-center gap-3 animate-fade-in">
          <span className="min-w-[64px] text-sm font-medium text-gray-300">Grosime</span>
          <input
            type="range" min={30} max={250} step={10} value={insulation}
            className="flex-1 accent-[#F5A623] cursor-pointer h-1.5 bg-gray-700 rounded-lg appearance-none"
            onChange={e => setInsulation(parseInt(e.target.value, 10))}
          />
          <div className="flex items-center gap-1.5">
            <input
              type="number" value={insulation} min={30} max={250} step={10}
              className="w-16 py-1.5 px-1 bg-[#1A1C20]/60 border border-gray-600 focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623] outline-none text-white rounded text-center font-bold transition-all"
              onChange={e => handleInputChange(e, setInsulation, 30, 250)}
            />
            <span className="text-xs text-gray-400 w-4">mm</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Ground() {
  // Load the PBR textures as an object
  const textures = useTexture({
    map: 'grass/grass_color.jpg',
    normalMap: 'grass/grass_normal.jpg',
    roughnessMap: 'grass/grass_roughness.jpg',
  });

  // We need to apply the repeating logic to ALL of the textures so they align perfectly
  Object.values(textures).forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // Repeat the grass 100 times across the 400x400 plane
    texture.repeat.set(400, 400);
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
      <planeGeometry args={[2000, 2000]} />
      {/* Spread all the loaded textures directly into the standard material */}
      <meshStandardMaterial {...textures} />
    </mesh>
  );


}

// ─── Root page component ──────────────────────────────────────────────────────
export default function ConfiguratorPage() {
  const [height, setHeight] = useState(3);
  const [width, setWidth] = useState(12);
  const [length, setLength] = useState(12);
  const [showFoundation, setShowFoundation] = useState(true);
  const [isIsolated, setIsIsolated] = useState(false);
  const [insulation, setInsulation] = useState(30);

  return (
    <div id="scene-container" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
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


        {/* Controale orbit — makeDefault exposes the instance via useThree().controls */}
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
        // maxPolarAngle={Math.PI / 2 - 0.05} // Prevents camera from going below ground
        // minDistance={2}
        // maxDistance={100}
        // screenSpacePanning={false}
        />

        {/* Configurator scene — receives slider values as props */}
        <ConfiguratorScene
          height={height}
          width={width}
          length={length}
          showFoundation={showFoundation}
          isIsolated={isIsolated}
          insulation={insulation}
        />
      </Canvas>

      {/* Sliders overlay (absolute-positioned on top of the canvas) */}
      <Sliders
        height={height} setHeight={setHeight}
        width={width} setWidth={setWidth}
        length={length} setLength={setLength}
        showFoundation={showFoundation} setShowFoundation={setShowFoundation}
        isIsolated={isIsolated} setIsIsolated={setIsIsolated} // <--- ADD THIS
        insulation={insulation} setInsulation={setInsulation}
      />
    </div>
  );
}
