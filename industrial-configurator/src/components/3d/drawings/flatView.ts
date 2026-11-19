/**
 * Pure helpers of the dimensions drawn on the orthographic fixed views (FlatViewDimensions.tsx): which drawing a view
 * shows, how big one screen pixel is, and where the drawing's sheet stands in the world. No three.js, unit-tested.
 */
import type { DrawingFrame, DrawingViewId, HallLayout, Vec3 } from '@/lib/hall';
import type { AnnotationSpacing } from '@/lib/hall/drawingsLayout';
import { CAMERA_VIEW_DIRECTIONS, type CameraView, type Projection } from '@/lib/hall/cameraViews';

const DRAWING_OF_VIEW: Partial<Record<CameraView, DrawingViewId>> = {
  front: 'front',
  back: 'back',
  left: 'left',
  right: 'right',
  top: 'plan',
};

/**
 * The drawing to show over the 3D view: the elevation or the plan of an axis view, in the orthographic projection only.
 * Null for the 3D view, for a perspective camera and once the user orbited away (`view === null`).
 */
export function drawingForView(view: CameraView | null, projection: Projection): DrawingViewId | null {
  if (view === null || projection !== 'orthographic') return null;
  return DRAWING_OF_VIEW[view] ?? null;
}

/** World metres per screen pixel of an orthographic camera (`zoom` is pixels per metre). */
export function metresPerPixel(zoom: number): number {
  return 1 / Math.max(zoom, 1e-6);
}

/** Screen distances of the annotations, in CSS pixels. */
export const FLAT_VIEW_SPACING: AnnotationSpacing = {
  first: 34,
  gap: 26,
  sillGap: 14,
  textOffset: 4,
  fontSize: 12,
  bubbleGap: 14,
  bubbleRadius: 10,
};

/** Tick (architectural slash) half-length and extension line overshoot, in pixels. */
export const TICK_PX = 4;
export const EXTENSION_GAP_PX = 3;
export const EXTENSION_OVERSHOOT_PX = 5;

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The sheet's normal: x × y, towards the viewer of the drawing. */
export function sheetNormal(frame: DrawingFrame): Vec3 {
  return cross(frame.axisX, frame.axisY);
}

/** How far in front of the sheet's origin (along its normal) the annotations go: past the whole hall, plus `clearance`. */
export function sheetLift(layout: HallLayout, frame: DrawingFrame, clearance = 0.5): number {
  const n = sheetNormal(frame);
  const { min, max } = layout.bounds;
  let lift = 0;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        lift = Math.max(lift, dot([x - frame.origin[0], y - frame.origin[1], z - frame.origin[2]], n));
      }
    }
  }
  return lift + clearance;
}

/**
 * Column-major 4×4 matrix (three.js `Matrix4.elements` order) taking sheet coordinates (x, y, 0) to the world, lifted
 * `lift` metres towards the viewer.
 */
export function sheetMatrix(frame: DrawingFrame, lift: number): number[] {
  const { origin: o, axisX: x, axisY: y } = frame;
  const n = sheetNormal(frame);
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, n[0], n[1], n[2], 0, o[0] + n[0] * lift, o[1] + n[1] * lift, o[2] + n[2] * lift, 1];
}

/** Whether a camera on `view` looks at the sheet's front (its normal points towards the camera). */
export function facesCamera(frame: DrawingFrame, view: CameraView): boolean {
  return dot(sheetNormal(frame), CAMERA_VIEW_DIRECTIONS[view]) > 0;
}
