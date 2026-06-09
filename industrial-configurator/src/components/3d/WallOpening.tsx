'use client';

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import type { Opening, WallId } from '@/stores/useOpeningsStore';
import { getWallDescriptors } from './PlacementMarkers';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WallOpeningProps {
  opening: Opening;
  hallWidth: number;
  hallHeight: number;
  hallLength: number;
}

// ─── Material configs ─────────────────────────────────────────────────────────
const WINDOW_COLOR = '#88ccff';
const WINDOW_OPACITY = 0.35;
const DOOR_COLOR = '#8B6914';
const GARAGE_DOOR_COLOR = '#666666';
const SELECTED_EMISSIVE = '#F5A623';
const HANDLE_COLOR = '#ffffff';
const HANDLE_SIZE = 0.08;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert normalised wall coords to world position for a given wall */
function normalizedToWorld(
  wallId: WallId,
  normX: number,
  normY: number,
  hallWidth: number,
  hallHeight: number,
  hallLength: number
): [number, number, number] {
  const walls = getWallDescriptors(hallWidth, hallHeight, hallLength);
  const wall = walls.find((w) => w.wallId === wallId)!;

  // Origin already includes the surface offset from getWallDescriptors
  const x =
    wall.originX +
    wall.axisH[0] * normX * wall.spanH;
  const y = normY * wall.spanV;
  const z =
    wall.originZ +
    wall.axisH[2] * normX * wall.spanH;

  return [x, y, z];
}

/** Get the rotation for a wall-aligned object */
function getWallRotation(wallId: WallId): [number, number, number] {
  switch (wallId) {
    case 'PereteFata':
      return [0, 0, 0]; // facing +Z
    case 'PereteSpate':
      return [0, Math.PI, 0]; // facing -Z
    case 'PereteSTG':
      return [0, Math.PI / 2, 0]; // facing -X
    case 'PereteDR':
      return [0, -Math.PI / 2, 0]; // facing +X
  }
}

/** Get the wall-local drag plane normal in world space */
function getWallNormal(wallId: WallId): THREE.Vector3 {
  switch (wallId) {
    case 'PereteFata':
      return new THREE.Vector3(0, 0, 1);
    case 'PereteSpate':
      return new THREE.Vector3(0, 0, -1);
    case 'PereteSTG':
      return new THREE.Vector3(-1, 0, 0);
    case 'PereteDR':
      return new THREE.Vector3(1, 0, 0);
  }
}

/** Get the wall-local horizontal axis in world space */
function getWallHorizontalAxis(wallId: WallId): THREE.Vector3 {
  switch (wallId) {
    case 'PereteFata':
      return new THREE.Vector3(1, 0, 0);
    case 'PereteSpate':
      return new THREE.Vector3(-1, 0, 0);
    case 'PereteSTG':
    case 'PereteDR':
      return new THREE.Vector3(0, 0, -1);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WallOpening({ opening, hallWidth, hallHeight, hallLength }: WallOpeningProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();

  const selectedId = useOpeningsStore((s) => s.selectedOpeningId);
  const selectOpening = useOpeningsStore((s) => s.selectOpening);
  const updateOpening = useOpeningsStore((s) => s.updateOpening);
  const setIsDragging = useOpeningsStore((s) => s.setIsDragging);

  const isSelected = selectedId === opening.id;
  const [localDragging, setLocalDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  // Refs for drag state
  const dragStartNorm = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartMouse = useRef<THREE.Vector3>(new THREE.Vector3());

  // Compute world position
  const worldPos = useMemo(
    () => normalizedToWorld(opening.wallId, opening.posX, opening.posY, hallWidth, hallHeight, hallLength),
    [opening.wallId, opening.posX, opening.posY, hallWidth, hallHeight, hallLength]
  );

  const rotation = useMemo(() => getWallRotation(opening.wallId), [opening.wallId]);

  // Get wall descriptor for bounds clamping
  const wallDesc = useMemo(() => {
    const walls = getWallDescriptors(hallWidth, hallHeight, hallLength);
    return walls.find((w) => w.wallId === opening.wallId)!;
  }, [opening.wallId, hallWidth, hallHeight, hallLength]);

  // ── Drag plane setup ────────────────────────────────────────────────────
  const dragPlane = useMemo(() => {
    const normal = getWallNormal(opening.wallId);
    const point = new THREE.Vector3(...worldPos);
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(normal, point);
    return plane;
  }, [opening.wallId, worldPos]);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  /** Convert a mouse event to a world-space intersection on the drag plane */
  const getPlaneIntersection = useCallback(
    (event: PointerEvent): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const target = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(dragPlane, target);
      return hit ? target : null;
    },
    [camera, gl, dragPlane, raycaster]
  );

  // ── Drag handlers ──────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!isSelected) return;
      e.stopPropagation();
      setLocalDragging(true);
      setIsDragging(true); // Disable orbit controls
      dragStartNorm.current = { x: opening.posX, y: opening.posY };
      const intersection = getPlaneIntersection(e.nativeEvent);
      if (intersection) {
        dragStartMouse.current.copy(intersection);
      }
      (e.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent.pointerId);
    },
    [isSelected, opening.posX, opening.posY, getPlaneIntersection, setIsDragging]
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!localDragging) return;
      e.stopPropagation();

      const intersection = getPlaneIntersection(e.nativeEvent);
      if (!intersection) return;

      const delta = intersection.clone().sub(dragStartMouse.current);
      const hAxis = getWallHorizontalAxis(opening.wallId);

      // Project delta onto wall axes
      const deltaH = delta.dot(hAxis) / wallDesc.spanH;
      const deltaV = delta.y / wallDesc.spanV;

      let newNormX = dragStartNorm.current.x + deltaH;
      let newNormY = dragStartNorm.current.y + deltaV;

      // Clamp within wall bounds (half-width/height margin)
      const halfW = opening.width / (2 * wallDesc.spanH);
      const halfH = opening.height / (2 * wallDesc.spanV);
      newNormX = Math.max(halfW, Math.min(1 - halfW, newNormX));
      newNormY = Math.max(halfH, Math.min(1 - halfH, newNormY));

      // Ground constraint for doors
      if (opening.type === 'door' || opening.type === 'garageDoor') {
        newNormY = halfH; // Lock bottom edge to ground
      }

      updateOpening(opening.id, { posX: newNormX, posY: newNormY });
    },
    [localDragging, getPlaneIntersection, opening, wallDesc, updateOpening]
  );

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!localDragging) return;
      e.stopPropagation();
      setLocalDragging(false);
      setIsDragging(false); // Re-enable orbit controls
    },
    [localDragging, setIsDragging]
  );

  // ── Resize handle drag ──────────────────────────────────────────────────
  const resizeStart = useRef<{ w: number; h: number; mouseWorld: THREE.Vector3 }>({
    w: 0, h: 0, mouseWorld: new THREE.Vector3(),
  });

  const handleResizePointerDown = useCallback(
    (handle: string, e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setActiveHandle(handle);
      setIsDragging(true); // Disable orbit controls
      resizeStart.current = {
        w: opening.width,
        h: opening.height,
        mouseWorld: new THREE.Vector3(),
      };
      const intersection = getPlaneIntersection(e.nativeEvent);
      if (intersection) {
        resizeStart.current.mouseWorld.copy(intersection);
      }
      (e.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent.pointerId);
    },
    [opening.width, opening.height, getPlaneIntersection, setIsDragging]
  );

  const handleResizePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!activeHandle) return;
      e.stopPropagation();

      const intersection = getPlaneIntersection(e.nativeEvent);
      if (!intersection) return;

      const delta = intersection.clone().sub(resizeStart.current.mouseWorld);
      const hAxis = getWallHorizontalAxis(opening.wallId);
      const deltaH = delta.dot(hAxis);
      const deltaV = delta.y;

      let newW = resizeStart.current.w;
      let newH = resizeStart.current.h;

      // Determine resize direction based on handle
      if (activeHandle.includes('r')) newW += deltaH;
      if (activeHandle.includes('l')) newW -= deltaH;
      if (activeHandle.includes('t')) newH += deltaV;
      if (activeHandle.includes('b')) newH -= deltaV;

      // Minimum size
      newW = Math.max(0.3, newW);
      newH = Math.max(0.3, newH);

      // Max size = wall dimensions
      newW = Math.min(wallDesc.spanH * 0.9, newW);
      newH = Math.min(wallDesc.spanV * 0.9, newH);

      updateOpening(opening.id, { width: newW, height: newH });
    },
    [activeHandle, getPlaneIntersection, opening, wallDesc, updateOpening]
  );

  const handleResizePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!activeHandle) return;
      e.stopPropagation();
      setActiveHandle(null);
      setIsDragging(false); // Re-enable orbit controls
    },
    [activeHandle, setIsDragging]
  );

  // ── Click to select ────────────────────────────────────────────────────
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      selectOpening(opening.id);
    },
    [opening.id, selectOpening]
  );

  // ── Material ────────────────────────────────────────────────────────────
  const materialProps = useMemo(() => {
    const base = {
      transparent: opening.type === 'window',
      opacity: opening.type === 'window' ? WINDOW_OPACITY : 1,
      color: opening.type === 'window'
        ? WINDOW_COLOR
        : opening.type === 'door'
          ? DOOR_COLOR
          : GARAGE_DOOR_COLOR,
      emissive: isSelected ? SELECTED_EMISSIVE : '#000000',
      emissiveIntensity: isSelected ? 0.3 : 0,
      metalness: opening.type === 'garageDoor' ? 0.7 : 0.1,
      roughness: opening.type === 'window' ? 0.1 : 0.6,
      side: THREE.DoubleSide as THREE.Side,
    };
    return base;
  }, [opening.type, isSelected]);

  // ── Frame (border around opening) ───────────────────────────────────────
  const frameThickness = 0.04;

  // ── Resize handles (4 corners) ─────────────────────────────────────────
  const handlePositions = useMemo(() => {
    const hw = opening.width / 2;
    const hh = opening.height / 2;
    return [
      { id: 'tl', pos: [-hw, hh, 0.05] as [number, number, number] },
      { id: 'tr', pos: [hw, hh, 0.05] as [number, number, number] },
      { id: 'bl', pos: [-hw, -hh, 0.05] as [number, number, number] },
      { id: 'br', pos: [hw, -hh, 0.05] as [number, number, number] },
    ];
  }, [opening.width, opening.height]);

  // Listen for global pointer up to cancel dragging/resizing if pointer leaves canvas
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (localDragging) {
        setLocalDragging(false);
        setIsDragging(false);
      }
      if (activeHandle) {
        setActiveHandle(null);
        setIsDragging(false);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, [localDragging, activeHandle, setIsDragging]);

  return (
    <group position={worldPos} rotation={rotation}>
      {/* Depth mask — renders FIRST, writes only to depth buffer (not color).
          Positioned slightly in front of the wall surface so the wall's own
          pixels behind this rectangle fail the depth test → visual hole. */}
      <mesh renderOrder={-1} position={[0, 0, 0.015]}>
        <planeGeometry args={[opening.width - 0.02, opening.height - 0.02]} />
        <meshBasicMaterial
          colorWrite={false}
          depthWrite={true}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Main opening mesh — sits in front of the depth mask so it's visible */}
      <mesh
        ref={meshRef}
        renderOrder={1}
        position={[0, 0, 0.025]}
        onClick={handleClick}
        onPointerDown={isSelected ? handlePointerDown : undefined}
        onPointerMove={isSelected && localDragging ? handlePointerMove : undefined}
        onPointerUp={isSelected ? handlePointerUp : undefined}
        castShadow={false}
        receiveShadow={false}
      >
        <planeGeometry args={[opening.width, opening.height]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>

      {/* Frame border */}
      <lineSegments renderOrder={2} position={[0, 0, 0.03]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(opening.width, opening.height)]} />
        <lineBasicMaterial
          color={isSelected ? '#F5A623' : '#333333'}
          linewidth={2}
        />
      </lineSegments>

      {/* Door-specific: horizontal line dividers for garage doors */}
      {opening.type === 'garageDoor' && (
        <group>
          {Array.from({ length: 3 }, (_, i) => {
            const y = -opening.height / 2 + ((i + 1) * opening.height) / 4;
            return (
              <line key={`div-${i}`}>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    args={[new Float32Array([
                      -opening.width / 2, y, 0.03,
                      opening.width / 2, y, 0.03,
                    ]), 3]}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#555555" />
              </line>
            );
          })}
        </group>
      )}

      {/* Frame thickness (thin box behind the plane to give depth) */}
      <mesh position={[0, 0, -frameThickness / 2]}>
        <boxGeometry args={[opening.width + frameThickness * 2, opening.height + frameThickness * 2, frameThickness]} />
        <meshStandardMaterial color="#333333" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Resize handles (visible only when selected) */}
      {isSelected &&
        handlePositions.map((hp) => (
          <mesh
            key={hp.id}
            position={hp.pos}
            renderOrder={3}
            onPointerDown={(e) => handleResizePointerDown(hp.id, e)}
            onPointerMove={activeHandle === hp.id ? handleResizePointerMove : undefined}
            onPointerUp={handleResizePointerUp}
          >
            <sphereGeometry args={[HANDLE_SIZE, 12, 12]} />
            <meshStandardMaterial
              color={HANDLE_COLOR}
              emissive="#F5A623"
              emissiveIntensity={0.5}
            />
          </mesh>
        ))}
    </group>
  );
}
