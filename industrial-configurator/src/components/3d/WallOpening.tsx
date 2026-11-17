'use client';

import { useRef, useCallback, useMemo, useEffect, useLayoutEffect, useState } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useOpeningsStore, resizeOpening } from '@/stores/useOpeningsStore';
import type { Opening } from '@/stores/useOpeningsStore';
import { wallPointToWorld } from '@/lib/hall';
import type { WallDescriptor } from '@/lib/hall';
import { DEFAULT_COLOR_HEXES, type HallColorHexes } from '@/lib/colors';
import type { OpeningType, ResizeHandle, WallSpan } from './openings/types';
import { isFloorStanding, openingCentre } from './openings/openingMath';
import { clipOpeningToWall, isMirrored } from './openings/wallShapeWithHoles';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WallOpeningProps {
  opening: Opening;
  /** Face of the wall the opening sits on (`layout.walls`). */
  wall: WallDescriptor;
  /** Overlaps a column, a downpipe or another opening (E7): drawn in red. */
  conflict?: boolean;
  /** The wall has a real hole (E2): no depth mask needed. */
  realHoles?: boolean;
  /** Door and window-frame colours. */
  colors?: Pick<HallColorHexes, 'doors' | 'windows'>;
}

// ─── Look ─────────────────────────────────────────────────────────────────────
const SELECTED_EMISSIVE = '#F5A623';
const CONFLICT_COLOR = '#E5252A';
const HANDLE_COLOR = '#ffffff';
const HANDLE_SIZE = 0.08;
const HANDLES: readonly ResizeHandle[] = ['tl', 'tr', 'bl', 'br'];
const GLASS_COLOR = '#a9c8d8';
const HARDWARE_COLOR = '#1c1c1c';

/** Width of the frame profile that lines the hole. */
const FRAME_WIDTH: Record<OpeningType, number> = { window: 0.06, door: 0.07, garageDoor: 0.1 };
/** The frame stands this far proud of the cladding, so it covers the cut edge of the panel. */
const FRAME_PROUD = 0.015;
/** The frame reaches this far into the wall around the hole, hiding the reveal. */
const FRAME_BITE = 0.003;
/** Door leaves and glass sit this far behind the outer face (or in the middle of a thinner wall). */
const LEAF_SETBACK = 0.03;
const LEAF_THICKNESS = 0.045;
/** Largest glass pane before a mullion / transom splits it. */
const MAX_PANE = { width: 1.2, height: 1.4 };
const MULLION = 0.05;
/** Height of one panel of a sectional industrial door. */
const SECTION_HEIGHT = 0.55;
const HANDLE_HEIGHT = 1.05;

type Box = { key: string; position: [number, number, number]; size: [number, number, number] };

/** Centres of the dividers that split `span` (centred on 0) into equal pieces no longer than `max`. */
function dividers(span: number, max: number): number[] {
  const pieces = Math.max(1, Math.ceil(span / max - 1e-9));
  return Array.from({ length: pieces - 1 }, (_, i) => -span / 2 + ((i + 1) * span) / pieces);
}

/**
 * The parts of an opening `w` x `h` (centred on the origin) in a wall `t` thick (outer face z = 0, inner z = -t).
 * The frame lines the whole depth of the hole and stands a little proud of the cladding, so no cut panel edge shows;
 * the leaf or glass sits inside it.
 */
export function openingParts(type: OpeningType, w: number, h: number, t: number) {
  const f = Math.min(FRAME_WIDTH[type], w / 4, h / 4);
  const depth = t + FRAME_PROUD;
  const zFrame = FRAME_PROUD - depth / 2;
  const bottomFrame = !isFloorStanding(type);
  const fw = f + FRAME_BITE;
  const frame: Box[] = [
    { key: 'top', position: [0, h / 2 - f / 2 + FRAME_BITE / 2, zFrame], size: [w + 2 * FRAME_BITE, fw, depth] },
    { key: 'left', position: [-w / 2 + f / 2 - FRAME_BITE / 2, 0, zFrame], size: [fw, h, depth] },
    { key: 'right', position: [w / 2 - f / 2 + FRAME_BITE / 2, 0, zFrame], size: [fw, h, depth] },
  ];
  if (bottomFrame) {
    frame.push({ key: 'bottom', position: [0, -h / 2 + f / 2 - FRAME_BITE / 2, zFrame], size: [w + 2 * FRAME_BITE, fw, depth] });
  }

  const inW = w - 2 * f;
  const inH = h - f - (bottomFrame ? f : 0);
  const inY = bottomFrame ? 0 : -f / 2;
  const zLeaf = -Math.min(LEAF_SETBACK, t / 2);

  const leaf: Box[] = [];
  const glass: Box[] = [];
  const grooves: Box[] = [];
  const hardware: Box[] = [];

  if (type === 'window') {
    glass.push({ key: 'glass', position: [0, inY, zLeaf], size: [inW, inH, 0.008] });
    for (const x of dividers(inW, MAX_PANE.width)) {
      frame.push({ key: `mullion${x}`, position: [x, inY, zLeaf], size: [MULLION, inH, 0.06] });
    }
    for (const y of dividers(inH, MAX_PANE.height)) {
      frame.push({ key: `transom${y}`, position: [0, inY + y, zLeaf], size: [inW, MULLION, 0.06] });
    }
    // Sill flashing: a drip under the window, standing out of the wall.
    hardware.push({ key: 'sill', position: [0, -h / 2 - 0.01, 0.03], size: [w + 0.06, 0.02, 0.06] });
  } else {
    leaf.push({ key: 'leaf', position: [0, inY, zLeaf], size: [inW, inH, LEAF_THICKNESS] });
    const front = zLeaf + LEAF_THICKNESS / 2;
    if (type === 'garageDoor') {
      for (const y of dividers(inH, SECTION_HEIGHT)) {
        grooves.push({ key: `groove${y}`, position: [0, inY + y, front + 0.001], size: [inW, 0.014, 0.004] });
      }
    } else {
      const y = Math.min(HANDLE_HEIGHT - h / 2, inY + inH / 2 - 0.1);
      const x = inW / 2 - 0.09;
      hardware.push(
        { key: 'rose', position: [x, y, front + 0.008], size: [0.04, 0.16, 0.016] },
        { key: 'lever', position: [x - 0.05, y + 0.04, front + 0.035], size: [0.13, 0.022, 0.022] },
      );
    }
  }
  return { frame, leaf, glass, grooves, hardware };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WallOpening({
  opening,
  wall,
  conflict = false,
  realHoles = false,
  colors = DEFAULT_COLOR_HEXES,
}: WallOpeningProps) {
  const { camera, gl } = useThree();

  const selectedId = useOpeningsStore((s) => s.selectedOpeningId);
  const selectOpening = useOpeningsStore((s) => s.selectOpening);
  const updateOpening = useOpeningsStore((s) => s.updateOpening);
  const setIsDragging = useOpeningsStore((s) => s.setIsDragging);

  const isSelected = selectedId === opening.id;
  /** Which interaction is running, only for visual feedback. */
  const [interaction, setInteraction] = useState<'move' | ResizeHandle | null>(null);
  /** Removes the window listeners of the running drag/resize. */
  const endSessionRef = useRef<(() => void) | null>(null);

  const span: WallSpan = useMemo(
    () => ({
      length: wall.spanH,
      height: wall.spanV,
      apex: wall.apexV > wall.spanV ? wall.apexV : undefined,
      apexAt: wall.apexH,
    }),
    [wall],
  );

  // Group sits at the opening centre on the wall face.
  const worldPos = useMemo<[number, number, number]>(() => {
    const c = openingCentre(opening);
    return [...wallPointToWorld(wall, c.x, c.y)] as [number, number, number];
  }, [wall, opening]);

  // Local +Z = the wall's outward normal. On the mirrored (left) wall local +X runs against `axisH`.
  const rotation = useMemo<[number, number, number]>(() => [0, wall.yaw, 0], [wall]);
  const xSign = isMirrored(wall) ? -1 : 1;

  // ── Geometry ────────────────────────────────────────────────────────
  // The part of the opening the wall actually cuts (the hole): never past the eave or the gable outline.
  const hole = useMemo(() => {
    const r = clipOpeningToWall(wall, opening) ?? {
      h0: opening.offsetX,
      h1: opening.offsetX + opening.width,
      v0: opening.sill,
      v1: opening.sill + opening.height,
    };
    const c = openingCentre(opening);
    return {
      w: r.h1 - r.h0,
      h: r.v1 - r.v0,
      // Offset of the hole's centre from the opening's centre, in the group's local frame.
      x: ((r.h0 + r.h1) / 2 - c.x) * xSign,
      y: (r.v0 + r.v1) / 2 - c.y,
    };
  }, [wall, opening, xSign]);

  const parts = useMemo(
    () => openingParts(opening.type, hole.w, hole.h, wall.thickness),
    [opening.type, hole.w, hole.h, wall.thickness],
  );

  // ── Materials: one set per opening; colours and highlights are updated in place ──
  const materials = useMemo(
    () => ({
      frame: new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.45 }),
      leaf: new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.5 }),
      groove: new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({
        color: GLASS_COLOR,
        metalness: 0.1,
        roughness: 0.05,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      hardware: new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.35 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  const invalidate = useThree((state) => state.invalidate);
  const frameHex = opening.type === 'window' ? colors.windows : colors.doors;
  useLayoutEffect(() => {
    materials.frame.color.set(frameHex);
    materials.leaf.color.set(colors.doors);
    materials.groove.color.set(colors.doors).multiplyScalar(0.45);
    // A window's only hardware is its sill flashing, in the frame colour.
    materials.hardware.color.set(opening.type === 'window' ? frameHex : HARDWARE_COLOR);
    const active = isSelected || interaction !== null;
    const glow = conflict ? CONFLICT_COLOR : active ? SELECTED_EMISSIVE : '#000000';
    const strength = conflict ? 0.6 : active ? 0.35 : 0;
    for (const m of [materials.frame, materials.leaf, materials.glass]) {
      m.emissive.set(glow);
      m.emissiveIntensity = strength;
    }
    invalidate();
  }, [materials, frameHex, colors.doors, opening.type, conflict, isSelected, interaction, invalidate]);

  // ── Pointer sessions ────────────────────────────────────────────────────
  // Move/up are tracked on `window`, so fast drags that leave the mesh (or the canvas) keep working.
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const intersect = useCallback(
    (clientX: number, clientY: number, plane: THREE.Plane): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    },
    [camera, gl, raycaster],
  );

  /** Starts a drag; `onDelta` gets the pointer delta in metres along the wall (dH) and up (dV). */
  const startSession = useCallback(
    (e: ThreeEvent<PointerEvent>, kind: 'move' | ResizeHandle, onDelta: (dH: number, dV: number) => void) => {
      e.stopPropagation();
      endSessionRef.current?.();

      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(...wall.normal),
        new THREE.Vector3(...worldPos),
      );
      const start = intersect(e.nativeEvent.clientX, e.nativeEvent.clientY, plane);
      if (!start) return;
      const axisH = new THREE.Vector3(...wall.axisH);
      const pointerId = e.nativeEvent.pointerId;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const hit = intersect(ev.clientX, ev.clientY, plane);
        if (!hit) return;
        const d = hit.sub(start);
        onDelta(d.dot(axisH), d.y);
      };
      const end = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        endSessionRef.current = null;
        setInteraction(null);
        setIsDragging(false);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) end();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      endSessionRef.current = end;
      setInteraction(kind);
      setIsDragging(true); // disables OrbitControls
    },
    [wall, worldPos, intersect, setIsDragging],
  );

  // End any running session on unmount (e.g. the opening was deleted mid-drag).
  useEffect(() => () => endSessionRef.current?.(), []);

  const handleMovePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const startOpening = opening;
      startSession(e, 'move', (dH, dV) => {
        // The store clamps to the wall and keeps doors on the floor.
        updateOpening(startOpening.id, {
          offsetX: startOpening.offsetX + dH,
          sill: startOpening.sill + dV,
        });
      });
    },
    [opening, startSession, updateOpening],
  );

  const handleResizePointerDown = useCallback(
    (handle: ResizeHandle, e: ThreeEvent<PointerEvent>) => {
      const startOpening = opening;
      startSession(e, handle, (dH, dV) => {
        const { offsetX, sill, width, height } = resizeOpening(startOpening, handle, dH, dV, span);
        updateOpening(startOpening.id, { offsetX, sill, width, height });
      });
    },
    [opening, span, startSession, updateOpening],
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      selectOpening(opening.id);
    },
    [opening.id, selectOpening],
  );

  const handlePositions = useMemo(() => {
    const hw = opening.width / 2;
    const hh = opening.height / 2;
    return HANDLES.map((id) => ({
      id,
      // 'r' = the edge with the larger offsetX, wherever that lands in local space.
      pos: [(id.includes('r') ? hw : -hw) * xSign, id.includes('t') ? hh : -hh, 0.05] as [number, number, number],
    }));
  }, [opening.width, opening.height, xSign]);

  const boxes = (list: Box[], material: THREE.Material, shadows = false) =>
    list.map((b) => (
      <mesh key={b.key} position={b.position} material={material} castShadow={shadows} receiveShadow>
        <boxGeometry args={b.size} />
      </mesh>
    ));

  return (
    <group position={worldPos} rotation={rotation}>
      <group position={[hole.x, hole.y, 0]}>
        {/* Depth mask for walls without real holes: hides the wall behind opaque doors. Windows keep the wall
            visible through the glass (the mask would show the clear colour instead of the hall). */}
        {!realHoles && opening.type !== 'window' && (
          <mesh renderOrder={-1} position={[0, 0, 0.001]}>
            <planeGeometry args={[hole.w, hole.h]} />
            <meshBasicMaterial colorWrite={false} depthWrite={true} side={THREE.FrontSide} />
          </mesh>
        )}

        {boxes(parts.frame, materials.frame, true)}
        {boxes(parts.leaf, materials.leaf, true)}
        {boxes(parts.grooves, materials.groove)}
        {boxes(parts.hardware, materials.hardware)}
        {parts.glass.map((b) => (
          <mesh key={b.key} position={b.position} material={materials.glass} renderOrder={1}>
            <boxGeometry args={b.size} />
          </mesh>
        ))}

        {/* Pick target: the whole opening, just in front of it. Never drawn, but still hit by the raycaster. */}
        <mesh
          position={[0, 0, FRAME_PROUD + 0.005]}
          onClick={handleClick}
          onPointerDown={isSelected ? handleMovePointerDown : undefined}
        >
          <planeGeometry args={[hole.w, hole.h]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* Resize handles (selected only). Each anchors the opposite corner. */}
      {isSelected &&
        handlePositions.map((hp) => (
          <mesh
            key={hp.id}
            position={hp.pos}
            renderOrder={3}
            onPointerDown={(e) => handleResizePointerDown(hp.id, e)}
          >
            <sphereGeometry args={[HANDLE_SIZE, 12, 12]} />
            <meshStandardMaterial
              color={HANDLE_COLOR}
              emissive="#F5A623"
              emissiveIntensity={interaction === hp.id ? 1 : 0.5}
            />
          </mesh>
        ))}
    </group>
  );
}
