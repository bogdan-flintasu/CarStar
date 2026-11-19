'use client';

/**
 * Dimensions of the orthographic fixed views ("vederi fixe"): on an elevation or the plan, the drawing's dimension
 * chains, grid axes with their bubbles and the opening sizes (src/lib/hall/drawings.ts) are drawn over the hall, on a
 * sheet lifted in front of it, so the cladding never hides them. Text, ticks and row spacing keep a constant size on
 * screen at any zoom; lines are 1 px. Hidden in the perspective view and as soon as the user orbits away.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { Matrix4, type OrthographicCamera } from 'three';
import { buildDrawing, type DrawingOpening, type HallLayout, type Vec2 } from '@/lib/hall';
import { placeDrawing } from '@/lib/hall/drawingsLayout';
import { useViewStore } from '@/stores/useViewStore';
import {
  drawingForView,
  EXTENSION_GAP_PX,
  EXTENSION_OVERSHOOT_PX,
  FLAT_VIEW_SPACING,
  metresPerPixel,
  sheetLift,
  sheetMatrix,
  TICK_PX,
} from './flatView';

interface FlatViewDimensionsProps {
  layout: HallLayout;
  openings: readonly DrawingOpening[];
  color: string;
}

const RENDER_ORDER = 1000;
/** Re-layout only when the zoom changed by more than this share (glides change it every frame). */
const ZOOM_EPSILON = 0.01;
const BUBBLE_SEGMENTS = 32;

type P3 = [number, number, number];
const p3 = ([x, y]: Vec2): P3 => [x, y, 0];

/** The orthographic camera's zoom, as React state (null while the camera is a perspective one). */
function useOrthoZoom(): number | null {
  const [zoom, setZoom] = useState<number | null>(null);
  useFrame(({ camera }) => {
    const next = (camera as OrthographicCamera).isOrthographicCamera ? camera.zoom : null;
    setZoom((current) => {
      if (next === null || current === null) return next === current ? current : next;
      return Math.abs(next - current) / current > ZOOM_EPSILON ? next : current;
    });
  });
  return zoom;
}

/** Text of a constant pixel size at `at` (sheet metres), rotated a quarter turn for vertical chains. */
function Label({ at, unit, color, vertical, children }: { at: Vec2; unit: number; color: string; vertical?: boolean; children: string }): ReactNode {
  return (
    <group position={p3(at)} scale={unit} rotation={[0, 0, vertical ? Math.PI / 2 : 0]}>
      <Text
        fontSize={FLAT_VIEW_SPACING.fontSize}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={2}
        outlineColor="#ffffff"
        material-depthTest={false}
        material-transparent
        renderOrder={RENDER_ORDER + 1}
      >
        {children}
      </Text>
    </group>
  );
}

function Seg({ points, color, dashed, unit, opacity = 1 }: { points: P3[]; color: string; dashed?: boolean; unit?: number; opacity?: number }) {
  return (
    <Line
      points={points}
      color={color}
      lineWidth={1}
      dashed={dashed}
      dashSize={dashed && unit ? 8 * unit : undefined}
      gapSize={dashed && unit ? 5 * unit : undefined}
      transparent={opacity < 1}
      opacity={opacity}
      depthTest={false}
      renderOrder={RENDER_ORDER}
    />
  );
}

export default function FlatViewDimensions({ layout, openings, color }: FlatViewDimensionsProps) {
  const view = useViewStore((s) => s.view);
  const projection = useViewStore((s) => s.projection);
  const drawingView = drawingForView(view, projection);
  const zoom = useOrthoZoom();

  const drawing = useMemo(() => (drawingView ? buildDrawing(layout, drawingView, openings) : null), [layout, drawingView, openings]);
  const matrix = useMemo(() => {
    if (!drawing) return null;
    return new Matrix4().fromArray(sheetMatrix(drawing.toWorld, sheetLift(layout, drawing.toWorld)));
  }, [drawing, layout]);
  const unit = zoom === null ? null : metresPerPixel(zoom);
  const placed = useMemo(() => (drawing && unit ? placeDrawing(drawing, unit, FLAT_VIEW_SPACING) : null), [drawing, unit]);

  if (!drawing || !matrix || !placed || unit === null) return null;

  const tick = TICK_PX * unit;
  const r = FLAT_VIEW_SPACING.bubbleRadius * unit;
  const circle = (c: Vec2): P3[] =>
    Array.from({ length: BUBBLE_SEGMENTS + 1 }, (_, i) => {
      const a = (i / BUBBLE_SEGMENTS) * Math.PI * 2;
      return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, 0];
    });

  return (
    <group matrix={matrix} matrixAutoUpdate={false} renderOrder={RENDER_ORDER}>
      {placed.axes.map((a) => {
        const ends: P3[] = a.direction === 'y' ? [[a.at, a.from, 0], [a.at, a.to, 0]] : [[a.from, a.at, 0], [a.to, a.at, 0]];
        return (
          <group key={`axis:${a.label}:${a.at}`}>
            <Seg points={ends} color={color} dashed unit={unit} opacity={0.55} />
            <Seg points={circle(a.bubble)} color={color} />
            <Label at={a.bubble} unit={unit} color={color}>
              {a.label}
            </Label>
          </group>
        );
      })}

      {placed.chains.map((c) => {
        const at = (along: number, across: number): P3 => (c.direction === 'x' ? [along, across, 0] : [across, along, 0]);
        const first = c.points[0];
        const last = c.points[c.points.length - 1];
        const gap = EXTENSION_GAP_PX * unit * c.outwards;
        const over = EXTENSION_OVERSHOOT_PX * unit * c.outwards;
        return (
          <group key={c.id}>
            <Seg points={[at(first, c.line), at(last, c.line)]} color={color} />
            {c.points.map((p) => (
              <group key={p}>
                {/* Extension line, from just off the feature to just past the dimension line. */}
                <Seg points={[at(p, c.base + gap), at(p, c.line + over)]} color={color} opacity={0.7} />
                {/* Architectural tick: a 45° slash through the point. */}
                <Seg points={[at(p - tick, c.line - tick), at(p + tick, c.line + tick)]} color={color} />
              </group>
            ))}
            {c.segments.map((s) =>
              s.fits ? (
                <Label key={`${s.from}-${s.to}`} at={s.textAt} unit={unit} color={color} vertical={c.direction === 'y'}>
                  {s.text}
                </Label>
              ) : null,
            )}
          </group>
        );
      })}

      {drawing.labels.map((l) => (
        <Label key={`${l.ref ?? ''}${l.text}${l.at.join()}`} at={l.at} unit={unit} color={color}>
          {l.text}
        </Label>
      ))}
    </group>
  );
}
