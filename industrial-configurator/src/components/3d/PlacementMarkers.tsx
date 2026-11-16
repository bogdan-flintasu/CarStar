'use client';

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useOpeningsStore, DEFAULT_DIMENSIONS, isFloorStanding } from '@/stores/useOpeningsStore';
import { getWallDescriptors } from './openings/wallSpans';
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

// Wall geometry lives in ./openings/wallSpans (single source until D1's layout.walls, E6).

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
    const wall = getWallDescriptors(hallWidth, hallHeight, hallLength).find((wd) => wd.wallId === marker.wallId)!;

    // Centre the opening on the marker; doors stand on the floor. The store clamps to the wall.
    addOpening({
      type: tool,
      wallId: marker.wallId,
      offsetX: marker.normX * wall.spanH - dims.width / 2,
      sill: isFloorStanding(tool) ? 0 : marker.normY * wall.spanV - dims.height / 2,
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
