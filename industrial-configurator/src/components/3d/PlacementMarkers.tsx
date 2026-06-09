'use client';

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useOpeningsStore, DEFAULT_DIMENSIONS } from '@/stores/useOpeningsStore';
import type { WallId, OpeningType } from '@/stores/useOpeningsStore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlacementMarkersProps {
  hallWidth: number;
  hallHeight: number;
  hallLength: number;
}

interface MarkerPoint {
  wallId: WallId;
  worldPos: [number, number, number];
  /** Normalized X on wall (0–1) */
  normX: number;
  /** Normalized Y on wall (0–1) */
  normY: number;
}

// ─── Wall geometry helpers ────────────────────────────────────────────────────
// These compute the actual world-space extents of each wall based on the
// imperative positioning logic in Configurator.tsx.

const THRESHOLD = 12;

/** Precise offsets to make openings sit perfectly flush on the exterior face of the GLTF panels.
 *  - Front/Back walls have a panel thickness offset of ~0.048m.
 *  - Left/Right side walls have a column + panel offset of ~0.44m past the structural half-width. */
const FRONT_BACK_WALL_OFFSET = 0.048;
const SIDE_WALL_OFFSET = 0.44;

function computePullMain(width: number): number {
  if (width > THRESHOLD) return (width - THRESHOLD) * 0.484;
  return -(THRESHOLD - width) * 0.487;
}

/**
 * Returns the 4 walls as rectangles in world space:
 *   origin  = bottom-left corner of the wall face
 *   axisH   = unit vector along the wall's horizontal direction
 *   axisV   = (0,1,0) always
 *   spanH   = wall width in metres
 *   spanV   = wall height in metres
 *   normal  = outward-facing normal (for offsetting markers)
 */
function getWallDescriptors(w: number, h: number, l: number) {
  const pull = computePullMain(w);
  const halfStruct = 6 + pull;

  // Front wall (PereteFata) sits at Z ≈ 0, spans X from -halfStruct to +halfStruct
  // Back wall (PereteSpate) sits at Z = -length
  // Left wall (PereteSTG) sits at X = -halfStruct, spans Z from 0 to -length
  // Right wall (PereteDR) sits at X = +halfStruct, spans Z from 0 to -length

  return [
    {
      wallId: 'PereteFata' as WallId,
      originX: -halfStruct, originY: 0, originZ: FRONT_BACK_WALL_OFFSET,
      axisH: [1, 0, 0] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      spanH: halfStruct * 2,
      spanV: h,
    },
    {
      wallId: 'PereteSpate' as WallId,
      originX: halfStruct, originY: 0, originZ: -l - FRONT_BACK_WALL_OFFSET,
      axisH: [-1, 0, 0] as [number, number, number],
      normal: [0, 0, -1] as [number, number, number],
      spanH: halfStruct * 2,
      spanV: h,
    },
    {
      wallId: 'PereteSTG' as WallId,
      originX: -halfStruct - SIDE_WALL_OFFSET, originY: 0, originZ: 0,
      axisH: [0, 0, -1] as [number, number, number],
      normal: [-1, 0, 0] as [number, number, number],
      spanH: l,
      spanV: h,
    },
    {
      wallId: 'PereteDR' as WallId,
      originX: halfStruct + SIDE_WALL_OFFSET, originY: 0, originZ: 0,
      axisH: [0, 0, -1] as [number, number, number],
      normal: [1, 0, 0] as [number, number, number],
      spanH: l,
      spanV: h,
    },
  ];
}

/**
 * Generate evenly-spaced marker positions on each wall (~2m apart horizontally).
 */
function generateMarkers(w: number, h: number, l: number): MarkerPoint[] {
  const walls = getWallDescriptors(w, h, l);
  const markers: MarkerPoint[] = [];
  const SPACING = 2; // metres between markers

  for (const wall of walls) {
    const countH = Math.max(1, Math.floor(wall.spanH / SPACING));
    const stepH = 1 / (countH + 1);

    for (let i = 1; i <= countH; i++) {
      const normX = i * stepH;
      const normY = 0.5; // vertically centred

      // Position is on the wall surface (origin already includes the surface offset)
      const worldX =
        wall.originX +
        wall.axisH[0] * normX * wall.spanH;
      const worldY = normY * wall.spanV;
      const worldZ =
        wall.originZ +
        wall.axisH[2] * normX * wall.spanH;

      markers.push({
        wallId: wall.wallId,
        worldPos: [worldX, worldY, worldZ],
        normX,
        normY,
      });
    }
  }

  return markers;
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
export default function PlacementMarkers({ hallWidth, hallHeight, hallLength }: PlacementMarkersProps) {
  const activeTool = useOpeningsStore((s) => s.activeTool);
  const hoveredWallId = useOpeningsStore((s) => s.hoveredWallId);
  const setHoveredWallId = useOpeningsStore((s) => s.setHoveredWallId);
  const clearHoveredWallId = useOpeningsStore((s) => s.clearHoveredWallId);
  const addOpening = useOpeningsStore((s) => s.addOpening);

  const markers = useMemo(
    () =>
      activeTool && hoveredWallId
        ? generateMarkers(hallWidth, hallHeight, hallLength).filter((m) => m.wallId === hoveredWallId)
        : [],
    [activeTool, hoveredWallId, hallWidth, hallHeight, hallLength]
  );

  if (!activeTool || !hoveredWallId) return null;

  const handleClick = (marker: MarkerPoint, tool: OpeningType) => {
    const dims = DEFAULT_DIMENSIONS[tool];
    const wallDescs = getWallDescriptors(hallWidth, hallHeight, hallLength);
    const wallDesc = wallDescs.find((wd) => wd.wallId === marker.wallId)!;

    // For doors, posY must place the bottom edge at ground level
    let posY = marker.normY;
    if (tool === 'door' || tool === 'garageDoor') {
      // posY is the centre of the opening, normalised
      // bottom edge = posY - (dims.height / 2) / wallHeight = 0
      // so posY = dims.height / (2 * wallHeight)
      posY = dims.height / (2 * wallDesc.spanV);
      // Clamp so the door doesn't go above the wall
      posY = Math.min(posY, 1 - dims.height / (2 * wallDesc.spanV));
    }

    addOpening({
      type: tool,
      wallId: marker.wallId,
      posX: marker.normX,
      posY,
      width: dims.width,
      height: dims.height,
    });
  };

  return (
    <group>
      {markers.map((m, i) => (
        <Html
          key={`marker-${m.wallId}-${i}`}
          position={m.worldPos}
          center
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            style={markerStyle}
            onClick={(e) => {
              e.stopPropagation();
              handleClick(m, activeTool);
            }}
            onPointerEnter={(e) => {
              (e.target as HTMLElement).style.transform = 'scale(1.2)';
              (e.target as HTMLElement).style.boxShadow = '0 4px 16px rgba(245,166,35,0.6)';
              setHoveredWallId(m.wallId);
            }}
            onPointerLeave={(e) => {
              (e.target as HTMLElement).style.transform = 'scale(1)';
              (e.target as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
              clearHoveredWallId();
            }}
            title={`Adaugă ${activeTool === 'window' ? 'geam' : activeTool === 'door' ? 'ușă' : 'ușă auto'} pe ${m.wallId}`}
          >
            +
          </div>
        </Html>
      ))}
    </group>
  );
}

// Re-export the wall descriptors helper for use by WallOpening
export { getWallDescriptors };
