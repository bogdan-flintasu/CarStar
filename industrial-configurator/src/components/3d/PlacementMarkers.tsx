'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { wallPointToWorld } from '@/lib/hall';
import type { HallLayout, WallDescriptor } from '@/lib/hall';
import { useOpeningsStore, DEFAULT_DIMENSIONS, isFloorStanding, clampOpening } from '@/stores/useOpeningsStore';
import type { Opening, OpeningType, WallId } from '@/stores/useOpeningsStore';
import { validateOpenings, wallSpansFromLayout } from './openings/validateOpenings';
import { useOpeningsLayout, useOpeningsVisible } from './openings/useOpeningsLayout';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlacementMarkersProps {
  /** The engine's layout. Omit to derive it from the configurator store. */
  layout?: HallLayout;
  /** Force visibility; by default placement shows whenever the walls do (E9). */
  visible?: boolean;
  /** @deprecated ignored: the layout carries the hall dimensions. */
  hallWidth?: number;
  /** @deprecated ignored. */
  hallHeight?: number;
  /** @deprecated ignored. */
  hallLength?: number;
}

/** Placement grid, metres. */
const SNAP = 0.1;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
/** Where the hit area and the ghost sit in front of the wall face; openings sit at 0.025 and win the raycast. */
const HIT_OFFSET = 0.01;
const GHOST_ID = '__ghost__';
const GHOST_COLOR = '#F5A623';
const GHOST_CONFLICT_COLOR = '#E5252A';

interface MarkerPoint {
  wall: WallDescriptor;
  /** Along the wall and up, in metres. */
  h: number;
  v: number;
}

/** Evenly spaced hint markers (~2 m apart) at mid-height of one wall. */
function generateMarkers(wall: WallDescriptor): MarkerPoint[] {
  const SPACING = 2;
  const count = Math.max(1, Math.floor(wall.spanH / SPACING));
  const step = wall.spanH / (count + 1);
  return Array.from({ length: count }, (_, i) => ({ wall, h: (i + 1) * step, v: wall.spanV / 2 }));
}

/** An opening of `tool` centred on (h, v), snapped to the grid. The store clamps again on add. */
function placementAt(tool: OpeningType, wallId: WallId, h: number, v: number): Omit<Opening, 'id'> {
  const dims = DEFAULT_DIMENSIONS[tool];
  return {
    type: tool,
    wallId,
    offsetX: snap(h - dims.width / 2),
    sill: isFloorStanding(tool) ? 0 : snap(v - dims.height / 2),
    width: dims.width,
    height: dims.height,
  };
}

/** The wall face as an invisible, raycastable mesh (follows the gable). */
function buildWallHitGeometry(wall: WallDescriptor): THREE.BufferGeometry {
  const outline = wall.polygon.map(([h, v]) => new THREE.Vector2(h, v));
  const positions = outline.flatMap((p) => wallPointToWorld(wall, p.x, p.y, HIT_OFFSET));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(THREE.ShapeUtils.triangulateShape(outline, []).flat());
  return geo;
}

// ─── Marker Button Style ──────────────────────────────────────────────────────
const markerStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: 'rgba(245, 166, 35, 0.85)',
  border: '2px solid rgba(255,255,255,0.9)',
  color: '#fff',
  fontSize: 20,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  userSelect: 'none',
  lineHeight: 1,
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlacementMarkers({ layout: layoutProp, visible }: PlacementMarkersProps) {
  const layout = useOpeningsLayout(layoutProp);
  const shown = useOpeningsVisible(visible);
  const activeTool = useOpeningsStore((s) => s.activeTool);
  const hoveredWallId = useOpeningsStore((s) => s.hoveredWallId);
  const setHoveredWallId = useOpeningsStore((s) => s.setHoveredWallId);
  const clearHoveredWallId = useOpeningsStore((s) => s.clearHoveredWallId);
  const addOpening = useOpeningsStore((s) => s.addOpening);
  const openings = useOpeningsStore((s) => s.openings);

  const walls = useMemo(() => Object.values(layout.walls), [layout]);
  const spans = useMemo(() => wallSpansFromLayout(layout), [layout]);
  const [rawGhost, setGhost] = useState<Omit<Opening, 'id'> | null>(null);
  // The ghost belongs to one tool: switching tools hides it until the pointer moves again.
  const ghost = rawGhost && rawGhost.type === activeTool ? rawGhost : null;

  const hitGeometries = useMemo(() => new Map(walls.map((w) => [w.id, buildWallHitGeometry(w)])), [walls]);
  useEffect(() => () => hitGeometries.forEach((g) => g.dispose()), [hitGeometries]);

  const ghostConflict = useMemo(() => {
    if (!ghost) return false;
    const candidate = clampOpening({ ...ghost, id: GHOST_ID }, spans[ghost.wallId]);
    return validateOpenings([...openings, candidate], spans).some((c) => c.openingId === GHOST_ID);
  }, [ghost, openings, spans]);

  if (!activeTool || !shown) return null;

  /** World hit point -> placement on `wall`, clamped like the store will. */
  const placementFromEvent = (wall: WallDescriptor, e: ThreeEvent<PointerEvent | MouseEvent>): Omit<Opening, 'id'> => {
    const p = e.point;
    const o = wall.origin;
    const h = (p.x - o[0]) * wall.axisH[0] + (p.z - o[2]) * wall.axisH[2];
    const placed = placementAt(activeTool, wall.id, h, p.y - o[1]);
    const { offsetX, sill, width, height } = clampOpening({ ...placed, id: GHOST_ID }, spans[wall.id]);
    return { ...placed, offsetX, sill, width, height };
  };

  const markers = hoveredWallId ? generateMarkers(walls.find((w) => w.id === hoveredWallId)!) : [];
  const ghostWall = ghost ? walls.find((w) => w.id === ghost.wallId)! : null;

  return (
    <group>
      {/* Click anywhere on a wall to place at the hit point (E11). */}
      {walls.map((wall) => (
        <mesh
          key={wall.id}
          geometry={hitGeometries.get(wall.id)}
          onPointerMove={(e) => {
            e.stopPropagation();
            setHoveredWallId(wall.id);
            setGhost(placementFromEvent(wall, e));
          }}
          onPointerOut={() => {
            setGhost(null);
            clearHoveredWallId();
          }}
          onClick={(e) => {
            e.stopPropagation();
            addOpening(placementFromEvent(wall, e));
          }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Ghost preview of the opening that the next click would create. */}
      {ghost && ghostWall && (
        <group
          position={wallPointToWorld(ghostWall, ghost.offsetX + ghost.width / 2, ghost.sill + ghost.height / 2, HIT_OFFSET * 2)}
          rotation={[0, ghostWall.yaw, 0]}
        >
          <mesh renderOrder={5}>
            <planeGeometry args={[ghost.width, ghost.height]} />
            <meshBasicMaterial
              color={ghostConflict ? GHOST_CONFLICT_COLOR : GHOST_COLOR}
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* The fixed "+" markers stay as a hint on the hovered wall. */}
      {markers.map((m, i) => (
        <Html
          key={`marker-${m.wall.id}-${i}`}
          position={wallPointToWorld(m.wall, m.h, m.v)}
          center
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            style={markerStyle}
            onClick={(e) => {
              e.stopPropagation();
              addOpening(placementAt(activeTool, m.wall.id, m.h, m.v));
            }}
            onPointerEnter={(e) => {
              (e.target as HTMLElement).style.transform = 'scale(1.2)';
              (e.target as HTMLElement).style.boxShadow = '0 4px 16px rgba(245,166,35,0.6)';
              setHoveredWallId(m.wall.id);
            }}
            onPointerLeave={(e) => {
              (e.target as HTMLElement).style.transform = 'scale(1)';
              (e.target as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
              clearHoveredWallId();
            }}
            title={`Adaugă ${activeTool === 'window' ? 'geam' : activeTool === 'door' ? 'ușă' : 'ușă auto'} pe ${m.wall.id}`}
          >
            +
          </div>
        </Html>
      ))}
    </group>
  );
}
