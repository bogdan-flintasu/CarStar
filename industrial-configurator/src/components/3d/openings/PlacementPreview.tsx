'use client';

/**
 * Placing openings (T1b): with a tool chosen, a see-through preview of the item follows the pointer over the walls and
 * settles into the bay under it; the bay is highlighted in the accent colour (red with "nu încape" when the item does
 * not fit). Click places it and the tool stays active; a right-click (without dragging) ends the tool.
 * Touch: no hover preview; a tap places the item and flashes the bay. A type card dragged from the panel and dropped
 * on a wall places it too (HTML5 drag; the preview follows the drag).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { wallPointToWorld } from '@/lib/hall';
import type { HallLayout, WallDescriptor } from '@/lib/hall';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { useAccentColor } from '@/components/configurator/UiThemeScope';
import type { OpeningType, WallId } from './types';
import { OPENING_DRAG_TYPE, previewAt, type PlacementPreview as Preview } from './placement';
import { markPlacementHintSeen } from './placementHint';
import SnapGuides from './SnapGuides';
import { wallSpansFromLayout } from './validateOpenings';
import { useOpeningsLayout, useOpeningsVisible } from './useOpeningsLayout';

/** Hit area, band and preview sit in front of the wall face; openings sit at 0.025 and win the raycast. */
const HIT_OFFSET = 0.01;
const BAND_OFFSET = 0.012;
const PREVIEW_OFFSET = 0.02;
const NO_FIT_COLOR = '#E5252A';
/** Height of the highlighted band at the foot of the bay, metres. */
const BAND_STRIP = 0.12;
/** A click that moved more than this (px) was a drag of the view (orbit / pan), not a click. */
const CLICK_SLOP = 5;
/** How long a tapped bay stays highlighted on touch screens, ms. */
const FLASH_MS = 700;

/** The wall face as an invisible, raycastable mesh (follows the gable). */
function buildWallHitGeometry(wall: WallDescriptor): THREE.BufferGeometry {
  const outline = wall.polygon.map(([h, v]) => new THREE.Vector2(h, v));
  const positions = outline.flatMap((p) => wallPointToWorld(wall, p.x, p.y, HIT_OFFSET));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(THREE.ShapeUtils.triangulateShape(outline, []).flat());
  return geo;
}

/** Whether Alt / ⌥ is held (while `active`). Reset when the window loses focus, so it never sticks. */
function useAltKey(active: boolean): boolean {
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => setAlt(e.altKey);
    const onBlur = () => setAlt(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      setAlt(false);
    };
  }, [active]);
  return alt;
}

/** World point on a wall -> (h, v) on its face. */
function wallCoords(wall: WallDescriptor, p: THREE.Vector3): { h: number; v: number } {
  const o = wall.origin;
  return { h: (p.x - o[0]) * wall.axisH[0] + (p.z - o[2]) * wall.axisH[2], v: p.y - o[1] };
}

interface PlacementPreviewProps {
  /** The engine's layout. Omit to derive it from the configurator store. */
  layout?: HallLayout;
  /** Force visibility; by default placement shows whenever the walls do (E9). */
  visible?: boolean;
}

export default function PlacementPreview({ layout: layoutProp, visible }: PlacementPreviewProps) {
  const layout = useOpeningsLayout(layoutProp);
  const shown = useOpeningsVisible(visible);
  const activeTool = useOpeningsStore((s) => s.activeTool);
  const openings = useOpeningsStore((s) => s.openings);
  const accent = useAccentColor();
  const { camera, gl } = useThree();

  const walls = useMemo(() => Object.values(layout.walls), [layout]);
  const spans = useMemo(() => wallSpansFromLayout(layout), [layout]);
  const hitGeometries = useMemo(() => new Map(walls.map((w) => [w.id, buildWallHitGeometry(w)])), [walls]);
  useEffect(() => () => hitGeometries.forEach((g) => g.dispose()), [hitGeometries]);
  const hitMeshes = useRef(new Map<WallId, THREE.Mesh>());

  /** The last pointer on a wall; the preview is derived from it, so it follows store and layout changes too. */
  const [pointer, setPointer] = useState<{ tool: OpeningType; wallId: WallId; h: number; v: number } | null>(null);
  const snapEnabled = useOpeningsStore((s) => s.snapEnabled);
  const altHeld = useAltKey(activeTool !== null);
  /** Snapping off: Alt / ⌥ held, or the "Aliniere" switch off. */
  const free = altHeld || !snapEnabled;
  const [flash, setFlash] = useState<Preview | null>(null);

  const preview = useMemo<Preview | null>(() => {
    if (!pointer || pointer.tool !== activeTool) return null;
    return previewAt({ type: pointer.tool, wallId: pointer.wallId, h: pointer.h, v: pointer.v, span: spans[pointer.wallId], others: openings, free });
  }, [pointer, activeTool, spans, openings, free]);

  const previewFor = useCallback(
    (tool: OpeningType, wallId: WallId, h: number, v: number, free: boolean) =>
      previewAt({ type: tool, wallId, h, v, span: spans[wallId], others: useOpeningsStore.getState().openings, free }),
    [spans],
  );

  /** Adds the previewed item when it fits; returns the preview used. */
  const place = useCallback(
    (tool: OpeningType, wallId: WallId, h: number, v: number, alt: boolean): Preview => {
      const free = alt || !useOpeningsStore.getState().snapEnabled;
      const p = previewFor(tool, wallId, h, v, free);
      if (p.fits) {
        useOpeningsStore.getState().addOpening({ type: tool, wallId, ...p.rect }, { free });
        // Keep the tool for the next item (addOpening selects the new one; the tool stays as it is).
        markPlacementHintSeen();
      }
      return p;
    },
    [previewFor],
  );

  // Touch flash fades on its own.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  // A right-click without a drag ends the tool (a right-drag still pans the view).
  useEffect(() => {
    if (!activeTool) return;
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 2 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < CLICK_SLOP) useOpeningsStore.getState().setActiveTool(null);
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [activeTool, gl]);

  // Drag a type card from the panel onto a wall: HTML5 drag over the canvas, our own raycast against the hit meshes.
  useEffect(() => {
    if (!shown) return;
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const hitAt = (e: DragEvent) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects([...hitMeshes.current.values()], false)[0];
      if (!hit) return null;
      const wall = walls.find((w) => hitMeshes.current.get(w.id) === hit.object);
      return wall ? { wallId: wall.id, ...wallCoords(wall, hit.point) } : null;
    };
    const isOurDrag = (e: DragEvent) => e.dataTransfer?.types.includes(OPENING_DRAG_TYPE) ?? false;
    const onOver = (e: DragEvent) => {
      const tool = useOpeningsStore.getState().activeTool;
      if (!isOurDrag(e) || !tool) return;
      e.preventDefault(); // allow the drop
      const hit = hitAt(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = hit ? 'copy' : 'none';
      setPointer(hit ? { tool, ...hit } : null);
    };
    const onLeave = () => setPointer(null);
    const onDrop = (e: DragEvent) => {
      const tool = useOpeningsStore.getState().activeTool;
      if (!isOurDrag(e) || !tool) return;
      e.preventDefault();
      const hit = hitAt(e);
      if (hit) place(tool, hit.wallId, hit.h, hit.v, e.altKey);
      setPointer(null);
    };
    el.addEventListener('dragover', onOver);
    el.addEventListener('dragleave', onLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('dragleave', onLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [shown, gl, camera, walls, place]);

  if (!activeTool || !shown) return null;

  const shownPreview = preview ?? flash;
  const previewWall = shownPreview ? walls.find((w) => w.id === shownPreview.wallId) : undefined;

  return (
    <group>
      {walls.map((wall) => (
        <mesh
          key={wall.id}
          ref={(m) => {
            if (m) hitMeshes.current.set(wall.id, m);
            else hitMeshes.current.delete(wall.id);
          }}
          geometry={hitGeometries.get(wall.id)}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            // Touch: no hover preview (a finger only "hovers" while it orbits the view).
            if (e.nativeEvent.pointerType === 'touch') return;
            setPointer({ tool: activeTool, wallId: wall.id, ...wallCoords(wall, e.point) });
          }}
          onPointerOut={() => setPointer(null)}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (e.delta > CLICK_SLOP) return; // the end of an orbit drag, not a click
            const { h, v } = wallCoords(wall, e.point);
            const p = place(activeTool, wall.id, h, v, e.nativeEvent.altKey);
            const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
            if (touch) setFlash(p);
          }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {shownPreview && previewWall && (
        <PreviewMarks preview={shownPreview} wall={previewWall} accent={accent} showItem={preview !== null} />
      )}
    </group>
  );
}

/** The bay band, the see-through item and the "nu încape" label. */
function PreviewMarks({
  preview,
  wall,
  accent,
  showItem,
}: {
  preview: Preview;
  wall: WallDescriptor;
  accent: string;
  showItem: boolean;
}) {
  const color = preview.fits ? accent : NO_FIT_COLOR;
  const guides = showItem ? preview.guides : [];
  const { band, rect } = preview;
  const bandW = band.h1 - band.h0;
  const bandH = wall.spanV;
  const bandMid = (band.h0 + band.h1) / 2;
  const at = (h: number, v: number, out: number) => wallPointToWorld(wall, h, v, out);
  const rotation: [number, number, number] = [0, wall.yaw, 0];

  return (
    <group>
      {/* Faint fill over the bay and a stronger strip at its foot. */}
      <mesh position={at(bandMid, bandH / 2, BAND_OFFSET)} rotation={rotation} renderOrder={4}>
        <planeGeometry args={[bandW, bandH]} />
        <meshBasicMaterial color={color} transparent opacity={preview.fits ? 0.08 : 0.14} depthWrite={false} />
      </mesh>
      <mesh position={at(bandMid, BAND_STRIP / 2, BAND_OFFSET + 0.001)} rotation={rotation} renderOrder={4}>
        <planeGeometry args={[bandW, BAND_STRIP]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
      </mesh>

      {showItem && (
        <mesh
          position={at(rect.offsetX + rect.width / 2, rect.sill + rect.height / 2, PREVIEW_OFFSET)}
          rotation={rotation}
          renderOrder={5}
        >
          <planeGeometry args={[rect.width, rect.height]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}

      {guides.length > 0 && <SnapGuides wall={wall} guides={guides} color={accent} />}

      {!preview.fits && (
        <Html
          position={at(rect.offsetX + rect.width / 2, rect.sill + rect.height + 0.35, PREVIEW_OFFSET)}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="whitespace-nowrap rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow">
            nu încape
          </div>
        </Html>
      )}
    </group>
  );
}
