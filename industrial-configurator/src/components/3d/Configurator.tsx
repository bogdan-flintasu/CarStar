'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// ─── Constants (same as original) ────────────────────────────────────────────
const model_height   = 6;
const initial_width  = 12;
const distanceLength = 6;
const DeltaX         = 1.5363;
const DeltaY         = 0.27089;
const model_width    = 12;
const minWidth       = 8;
const midWidth       = 12;
const maxWidth       = 20;
const maxrise        = 0.696;
const minrise        = -0.335;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConfiguratorProps {
  height: number;
  width:  number;
  length: number;
}

// ─── Inner R3F scene component ────────────────────────────────────────────────
// Lives inside <Canvas> so it has access to useThree / useGLTF
function ConfiguratorScene({ height, width, length }: ConfiguratorProps) {
  const { camera, controls } = useThree();

  // GLTF loader (replaces: loader.load(window.MODEL_URL, ...))
  const { scene: gltfScene } = useGLTF('/models/pula.gltf');

  // ── Imperative state refs  (mirrors original module-level variables) ───────
  const resize_height     = useRef<THREE.Mesh[]>([]);
  const lowered           = useRef<THREE.Object3D[]>([]);
  const threemeters       = useRef<THREE.Object3D[]>([]);
  const fourmeters_lower  = useRef<THREE.Object3D[]>([]);
  const fourmeters_height = useRef(0);
  const fivemeters        = useRef<THREE.Object3D[]>([]);
  const resize_width      = useRef<THREE.Mesh[]>([]);
  const left              = useRef<THREE.Mesh[]>([]);
  const right             = useRef<THREE.Mesh[]>([]);
  const grinzi            = useRef<THREE.Mesh[]>([]);
  const grinziLeft        = useRef<THREE.Mesh[]>([]);
  const grinziRight       = useRef<THREE.Mesh[]>([]);

  const initial_scale            = useRef(1);
  const baza_stalp               = useRef<THREE.Mesh | null>(null);
  const baza_stalp001            = useRef<THREE.Mesh | null>(null);
  const suruburi_sus001          = useRef<THREE.Mesh | null>(null);
  const suruburi_sus002          = useRef<THREE.Mesh | null>(null);
  const plane_sus_1              = useRef<THREE.Mesh | null>(null);
  const plane_sus_2              = useRef<THREE.Mesh | null>(null);
  const baseModel                = useRef<THREE.Object3D | null>(null);
  const modelsGroup              = useRef<THREE.Group | null>(null);
  const lastGrindaLeft           = useRef<THREE.Mesh | null>(null);
  const lastGrindaRight          = useRef<THREE.Mesh | null>(null);
  const extraGrindaLeft          = useRef<THREE.Mesh | null>(null);
  const extraGrindaRight         = useRef<THREE.Mesh | null>(null);
  const extraGrindaLeftTemplate  = useRef<THREE.Mesh | null>(null);
  const extraGrindaRightTemplate = useRef<THREE.Mesh | null>(null);
  const newGrindaLeft            = useRef<THREE.Mesh | null>(null);
  const newGrindaRight           = useRef<THREE.Mesh | null>(null);
  const newGrindaLeftTemplate    = useRef<THREE.Mesh | null>(null);
  const newGrindaRightTemplate   = useRef<THREE.Mesh | null>(null);

  const currentRise = useRef(0);
  const ok          = useRef(true);

  // Track previous prop values to detect which slider actually changed
  const prevHeight = useRef(height);
  const prevWidth  = useRef(width);
  const prevLength = useRef(length);
  // Always-current height ref (avoids stale closure inside width effect)
  const heightRef  = useRef(height);
  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  // ── Helpers (exact translation of original functions) ─────────────────────

  function updateCamera(len: number) {
    camera.position.set(
      Math.min(-10, -len * 0.3),
      Math.max(6,   len * 0.2),
      Math.max(10,  len * 0.2)
    );
    const centerZ = -len / 2;
    // controls is the OrbitControls instance when makeDefault is set
    if (controls) {
      (controls as unknown as { target: THREE.Vector3; update(): void })
        .target.set(0, 0, centerZ);
      (controls as unknown as { update(): void }).update();
    }
  }

  function updateLastFrameBeams() {
    const mg = modelsGroup.current;
    if (!mg || mg.children.length === 0) return;
    const lastIndex = mg.children.length - 1;
    mg.children.forEach((frame, i) => {
      frame.traverse(child => {
        if (!child.userData.isGrinda) return;
        child.visible = i !== lastIndex;
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
      child.castShadow    = true;
      child.receiveShadow = true;

      if (child.name === 'suruburi_laterale008') {
        lastGrindaLeft.current          = child;
        extraGrindaLeftTemplate.current = child;
        newGrindaLeftTemplate.current   = child;
      }
      if (child.name === 'suruburi_laterale017') {
        lastGrindaRight.current          = child;
        extraGrindaRightTemplate.current = child;
        newGrindaRightTemplate.current   = child;
      }

      if (child.name === 'baza_stalp' || child.name === 'stalp_sus_1' || child.name === 'suruburi_sus001') {
        left.current.push(child);
      }
      if (child.name === 'baza_stalp001' || child.name === 'stalp_sus' || child.name === 'suruburi_sus002') {
        right.current.push(child);
      }

      if (['suruburi_laterale005','suruburi_laterale006','suruburi_laterale007','suruburi_laterale008'].includes(child.name)) {
        grinziLeft.current.push(child);
        child.userData.initialX = child.position.x;
        child.userData.initialY = child.position.y;
      }
      if (['suruburi_laterale014','suruburi_laterale015','suruburi_laterale016','suruburi_laterale017'].includes(child.name)) {
        grinziRight.current.push(child);
        child.userData.initialX = child.position.x;
        child.userData.initialY = child.position.y;
      }

      if (child.name === 'stalp_1' || child.name === 'stalp_2') {
        resize_height.current.push(child);
      }

      if ([
        'suruburi_sus001','suruburi_sus002','aripa_lateral','plane_aripioara001',
        'suruburi_sus','aripioara_sustinere_sus','aripioara_lateral','plane_aripioara',
        'suruburi_sus003','aripioara_sustinere_sus002','plane_sus_1','plane_sus_2',
      ].includes(child.name)) {
        lowered.current.push(child);
        child.userData.initialY = child.position.y;
      }

      if (['suruburi_laterale002','suruburi_laterale003','suruburi_laterale011','suruburi_laterale012'].includes(child.name)) {
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
    });

    // Apply initial height = 3
    const initial_height = 3;
    const scale = initial_height / model_height;
    initial_scale.current = scale;

    resize_height.current.forEach(mesh => { mesh.scale.y = scale; });
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
    baseModel.current   = model;
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

    return () => { mg.removeFromParent(); };
  }, [gltfScene]);

  // ── HEIGHT slider ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!baseModel.current || !modelsGroup.current) return;
    if (prevHeight.current === height) return;
    prevHeight.current = height;

    const new_height = height;
    const scale = new_height / model_height;
    resize_height.current.forEach(mesh => { mesh.scale.y = scale; });

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
              if (!mesh.userData.isGrinda) mesh.visible = baseMesh.visible;
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

    const newLength     = length;
    const requiredCount = Math.floor(newLength / distanceLength) + 1;
    const mg            = modelsGroup.current;
    const bm            = baseModel.current;

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
  }, [length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WIDTH slider ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!baseModel.current || !modelsGroup.current) return;
    if (prevWidth.current === width) return;
    prevWidth.current = width;

    const new_width = width;

    const half_new     = new_width / 2;
    const half_initial = model_width / 2;
    const scaleX       = half_new / half_initial;
    const delta        = half_new - half_initial;
    const widthDelta   = new_width - initial_width;

    const bs  = baza_stalp.current;
    const bs1 = baza_stalp001.current;
    const ss1 = suruburi_sus001.current;
    const ss2 = suruburi_sus002.current;
    if (bs && bs1 && ss1 && ss2) {
      bs.position.x  = bs.userData.initialX  - delta;
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

    const lgLeft  = lastGrindaLeft.current;
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
      let moveFactor      = move;
      let riseFactorRight = rise * 0.252;
      let riseFactorLeft  = rise * 0.255;
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
      let moveFactor: number   = (new_width - 15) / 10.3;
      const riseFactor: number = (new_width - 15) / 58;
      let riseFactorRight: number;
      let riseFactorLeft: number;

      if (new_width > initial_width && new_width <= 14) {
        moveFactor      = move;
        riseFactorRight = rise * 0.252;
        riseFactorLeft  = rise * 0.255;
      } else if (new_width >= 19 && new_width <= 20) {
        moveFactor      = (new_width - 18) / 12.4;
        riseFactorRight = (new_width - 18) / 70;
        riseFactorLeft  = riseFactorRight;
      } else {
        riseFactorRight = riseFactor;
        riseFactorLeft  = riseFactor;
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
        mesh.position.y = mesh.userData.initialY + rise * 0.006;
      }
    });
    grinziRight.current.forEach(mesh => {
      if (new_width === 15 || new_width === 12 || new_width === 18) {
        mesh.position.x = mesh.userData.initialX;
        mesh.position.y = mesh.userData.initialY + rise * 0.006;
      }
    });

    // Resize width meshes + tilt roof
    resize_width.current.forEach(mesh => {
      mesh.scale.x = scaleX;
      const localLen = (mesh.userData.localLength || 1) * mesh.scale.x;
      const angle    = Math.atan2(rise, localLen);
      if (mesh.name.includes('stalp_sus_1')) {
        mesh.position.x = mesh.userData.initialX - delta;
        mesh.rotation.z = angle;
      } else {
        mesh.position.x = mesh.userData.initialX + delta;
        mesh.rotation.z = -angle;
      }
      const p1 = plane_sus_1.current;
      const p2 = plane_sus_2.current;
      // Use heightRef.current (not the stale 'height' closure) to match
      // the original's live DOM read: parseInt(heightSlider.value, 10)
      const sc = heightRef.current / model_height;
      const dh = (sc - initial_scale.current) * model_height;
      if (p1 && p2) {
        p1.position.y = p1.userData.initialY + dh + rise;
        p2.position.y = p2.userData.initialY + dh + rise;
      }
    });

    // Pull left/right column groups
    const THRESHOLD = 12;
    let pullMain  = 0;
    let pullStalp = 0;
    if (new_width > THRESHOLD) {
      const excess = new_width - THRESHOLD;
      pullMain  = excess * 0.484;
      pullStalp = pullMain;
    } else {
      const deficit = THRESHOLD - new_width;
      pullMain  = -deficit * 0.487;
      pullStalp = pullMain * 0.987;
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
              if (!mesh.userData.isGrinda) mesh.visible = baseMesh.visible;
            }
          }
        });
      }
    });
    updateLastFrameBeams();
    updateLastFrameBeams();
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject modelsGroup into the R3F scene as an imperative primitive (built in useEffect).
  // eslint-disable-next-line react-hooks/refs -- R3F <primitive>: group is attached in GLTF useEffect
  if (!modelsGroup.current) return null;
  // eslint-disable-next-line react-hooks/refs
  return <primitive object={modelsGroup.current} />;
}

// ─── Slider UI overlay (replaces the HTML sliders) ───────────────────────────
interface SlidersProps {
  height: number; setHeight: (v: number) => void;
  width:  number; setWidth:  (v: number) => void;
  length: number; setLength: (v: number) => void;
}
function Sliders({ height, setHeight, width, setWidth, length, setLength }: SlidersProps) {
  const panel: React.CSSProperties = {
    position: 'absolute',
    background: '#fff',
    padding: '10px',
    borderRadius: '8px',
    left: '10px',
  };
  return (
    <>
      <div style={{ ...panel, top: '10px' }}>
        <label>Înălțime: <span id="heightValue">{height}</span> m</label><br />
        <input id="heightSlider" type="range" min={3} max={6} step={1} value={height}
          onChange={e => setHeight(parseInt(e.target.value, 10))} />
      </div>

      <div style={{ ...panel, top: '80px' }}>
        <label>Lățime: <span id="widthValue">{width}</span> m</label><br />
        <input id="widthSlider" type="range" min={8} max={20} step={1} value={width}
          onChange={e => setWidth(parseInt(e.target.value, 10))} />
      </div>

      <div style={{ ...panel, top: '150px' }}>
        <label>Lungime: <span id="lengthValue">{length}</span> m</label><br />
        <input id="lengthSlider" type="range" min={12} max={102} step={6} value={length}
          onChange={e => setLength(parseInt(e.target.value, 10))} />
      </div>
    </>
  );
}

// ─── Root page component ──────────────────────────────────────────────────────
export default function ConfiguratorPage() {
  const [height, setHeight] = useState(3);
  const [width,  setWidth]  = useState(12);
  const [length, setLength] = useState(12);

  return (
    <div id="scene-container" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000, position: [-6, 7, 13] as [number, number, number] }}
        shadows={{ type: THREE.PCFShadowMap }}
        frameloop="always"
        style={{ background: '#aaaaaa', width: '100%', height: '100%' }}
      >
        {/* Lumina directionala cu umbre */}
        <directionalLight
          position={[5, 10, 5]}
          intensity={1}
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
        <ambientLight intensity={1} />

        {/* Plan pentru umbre */}
        <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <shadowMaterial opacity={0.4} />
        </mesh>

        {/* Controale orbit — makeDefault exposes the instance via useThree().controls */}
        <OrbitControls makeDefault target={[0, 0, 0]} />

        {/* Configurator scene — receives slider values as props */}
        <ConfiguratorScene height={height} width={width} length={length} />
      </Canvas>

      {/* Sliders overlay (absolute-positioned on top of the canvas) */}
      <Sliders
        height={height} setHeight={setHeight}
        width={width}   setWidth={setWidth}
        length={length} setLength={setLength}
      />
    </div>
  );
}
