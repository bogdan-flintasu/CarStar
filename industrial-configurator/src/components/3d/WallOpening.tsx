'use client';

import { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useOpeningsStore, resizeOpening } from '@/stores/useOpeningsStore';
import type { Opening } from '@/stores/useOpeningsStore';
import { wallPointToWorld } from '@/lib/hall';
import type { WallDescriptor } from '@/lib/hall';
import type { ResizeHandle, WallSpan } from './openings/types';
import { openingCentre } from './openings/openingMath';
import { isMirrored } from './openings/wallShapeWithHoles';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WallOpeningProps {
  opening: Opening;
  /** Face of the wall the opening sits on (`layout.walls`). */
  wall: WallDescriptor;
  /** Overlaps a column, a downpipe or another opening (E7): drawn in red. */
  conflict?: boolean;
  /** The wall has a real hole (E2): no depth mask needed. */
  realHoles?: boolean;
}

// ─── Material configs ─────────────────────────────────────────────────────────
const WINDOW_COLOR = '#88ccff';
const WINDOW_OPACITY = 0.35;
const DOOR_COLOR = '#8B6914';
const GARAGE_DOOR_COLOR = '#666666';
const SELECTED_EMISSIVE = '#F5A623';
const CONFLICT_COLOR = '#E5252A';
const HANDLE_COLOR = '#ffffff';
const HANDLE_SIZE = 0.08;
const FRAME_THICKNESS = 0.04;
const GARAGE_DIVIDER_COUNT = 3;
const HANDLES: readonly ResizeHandle[] = ['tl', 'tr', 'bl', 'br'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Horizontal divider lines of an industrial door, as one line-segments geometry. */
function buildDividerGeometry(width: number, height: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let i = 1; i <= GARAGE_DIVIDER_COUNT; i++) {
    const y = -height / 2 + (i * height) / (GARAGE_DIVIDER_COUNT + 1);
    pts.push(-width / 2, y, 0.03, width / 2, y, 0.03);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildEdgesGeometry(width: number, height: number): THREE.EdgesGeometry {
  const plane = new THREE.PlaneGeometry(width, height);
  const edges = new THREE.EdgesGeometry(plane);
  plane.dispose();
  return edges;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WallOpening({ opening, wall, conflict = false, realHoles = false }: WallOpeningProps) {
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
    () => ({ length: wall.spanH, height: wall.spanV, apex: wall.apexV > wall.spanV ? wall.apexV : undefined }),
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

  // ── Geometry (memoised and disposed: no per-render GPU buffers) ─────────
  const edgesGeometry = useMemo(
    () => buildEdgesGeometry(opening.width, opening.height),
    [opening.width, opening.height],
  );
  useEffect(() => () => edgesGeometry.dispose(), [edgesGeometry]);

  const dividerGeometry = useMemo(
    () => (opening.type === 'garageDoor' ? buildDividerGeometry(opening.width, opening.height) : null),
    [opening.type, opening.width, opening.height],
  );
  useEffect(() => () => dividerGeometry?.dispose(), [dividerGeometry]);

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

  // ── Material ────────────────────────────────────────────────────────────
  const materialProps = useMemo(
    () => ({
      transparent: opening.type === 'window',
      opacity: opening.type === 'window' ? WINDOW_OPACITY : 1,
      color:
        opening.type === 'window' ? WINDOW_COLOR : opening.type === 'door' ? DOOR_COLOR : GARAGE_DOOR_COLOR,
      emissive: conflict ? CONFLICT_COLOR : isSelected ? SELECTED_EMISSIVE : '#000000',
      emissiveIntensity: conflict ? 0.6 : isSelected ? 0.3 : 0,
      metalness: opening.type === 'garageDoor' ? 0.7 : 0.1,
      roughness: opening.type === 'window' ? 0.1 : 0.6,
      side: THREE.DoubleSide as THREE.Side,
    }),
    [opening.type, isSelected, conflict],
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

  return (
    <group position={worldPos} rotation={rotation}>
      {/* Depth mask for walls without real holes: hides the wall behind opaque doors. Windows keep the wall
          visible through the glass (the mask would show the clear colour instead of the hall). */}
      {!realHoles && opening.type !== 'window' && (
        <mesh renderOrder={-1} position={[0, 0, 0.015]}>
          <planeGeometry args={[opening.width - 0.02, opening.height - 0.02]} />
          <meshBasicMaterial colorWrite={false} depthWrite={true} side={THREE.FrontSide} />
        </mesh>
      )}

      {/* Main opening mesh */}
      <mesh
        renderOrder={1}
        position={[0, 0, 0.025]}
        onClick={handleClick}
        onPointerDown={isSelected ? handleMovePointerDown : undefined}
        castShadow={false}
        receiveShadow={false}
      >
        <planeGeometry args={[opening.width, opening.height]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>

      {/* Frame border */}
      <lineSegments renderOrder={2} position={[0, 0, 0.03]} geometry={edgesGeometry}>
        <lineBasicMaterial color={conflict ? CONFLICT_COLOR : isSelected || interaction ? '#F5A623' : '#333333'} />
      </lineSegments>

      {/* Industrial door: horizontal panel dividers */}
      {dividerGeometry && (
        <lineSegments geometry={dividerGeometry}>
          <lineBasicMaterial color="#555555" />
        </lineSegments>
      )}

      {/* Frame thickness (thin box behind the plane to give depth) */}
      <mesh position={[0, 0, -FRAME_THICKNESS / 2]}>
        <boxGeometry
          args={[opening.width + FRAME_THICKNESS * 2, opening.height + FRAME_THICKNESS * 2, FRAME_THICKNESS]}
        />
        <meshStandardMaterial color="#333333" metalness={0.5} roughness={0.5} />
      </mesh>

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
