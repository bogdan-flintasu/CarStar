/**
 * Fixed camera views of the live configurator ("vederi fixe"): the three axes X / Y / Z, both ways, plus the 3D view.
 * Pure math on the HallLayout, no three.js, so it is unit-tested and the same views can later feed DXF elevations.
 *
 * Axes of the hall (see types.ts): X across the width (left wall at -X), Y up, Z along the length (front frame at Z = 0,
 * back frame at Z = -length). A view is named after where the camera stands: "front" looks at the front gable from +Z.
 */
import type { HallLayout, Vec3 } from './types';
import { frameView, hallOutlinePoints } from './renderViews';

export const CAMERA_VIEWS = ['iso', 'front', 'back', 'left', 'right', 'top'] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];
export type Projection = 'perspective' | 'orthographic';

export const CAMERA_VIEW_LABELS: Record<CameraView, string> = {
  iso: '3D',
  front: 'Față',
  back: 'Spate',
  left: 'Stânga',
  right: 'Dreapta',
  top: 'Plan',
};

/** Which axis each view looks along, for the labels of the view toolbar. */
export const CAMERA_VIEW_AXES: Record<CameraView, string> = {
  iso: 'XYZ',
  front: '+Z',
  back: '−Z',
  left: '−X',
  right: '+X',
  top: '+Y',
};

/** Keyboard shortcut of each view (digits, as on a numeric keypad in CAD programs). */
export const CAMERA_VIEW_KEYS: Record<CameraView, string> = {
  iso: '0',
  front: '1',
  back: '2',
  left: '3',
  right: '4',
  top: '5',
};

/**
 * From the hall towards the camera. The plan view leans a hair towards +Z so "up" on screen stays well defined
 * (the orbit controls cannot look exactly straight down) and the front gable is at the bottom of the screen.
 */
export const CAMERA_VIEW_DIRECTIONS: Record<CameraView, Vec3> = {
  iso: normalize([-0.55, 0.38, 0.75]),
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: normalize([0, 1, 1e-3]),
};

/** Vertical field of view (degrees) of the configurator's perspective camera: a narrow lens keeps the hall undistorted. */
export const CONFIGURATOR_FOV = 45;

/** Share of the frame the hall fills on its limiting axis: room is left for the overlays around the 3D view. */
export const VIEW_FILL = 0.72;

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  /** Orthographic zoom (pixels per metre); 1 for a perspective camera. */
  zoom: number;
}

type V = [number, number, number];
function normalize(a: Vec3): V {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Screen axes of a camera looking along -`back` with world +Y up: right, up and forward unit vectors. */
export function viewBasis(back: Vec3): { right: V; up: V; forward: V } {
  const b = normalize(back);
  const forward: V = [-b[0], -b[1], -b[2]];
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { right, up, forward };
}

/** Radius of the sphere around the hall's bounds: how far back an orthographic camera stands, so nothing is clipped. */
export function hallRadius(layout: HallLayout): number {
  const { min, max } = layout.bounds;
  return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
}

/**
 * Orthographic framing: the camera looks along -`direction` at the centre of the hall's outline as seen on screen,
 * zoomed so the outline fills `fill` of a viewport of `width` × `height` pixels on its limiting axis.
 */
export function frameOrthographic(
  points: readonly Vec3[],
  direction: Vec3,
  width: number,
  height: number,
  standOff: number,
  fill = VIEW_FILL,
): CameraPose {
  const back = normalize(direction);
  const { right, up } = viewBasis(back);
  let [minR, maxR, minU, maxU, minB] = [Infinity, -Infinity, Infinity, -Infinity, Infinity];
  for (const p of points) {
    const r = dot(p, right);
    const u = dot(p, up);
    [minR, maxR, minU, maxU] = [Math.min(minR, r), Math.max(maxR, r), Math.min(minU, u), Math.max(maxU, u)];
    minB = Math.min(minB, dot(p, back));
  }
  const centreR = (minR + maxR) / 2;
  const centreU = (minU + maxU) / 2;
  // Any depth works for an orthographic picture: take the point on the outline's middle plane.
  let mean = 0;
  for (const p of points) mean += dot(p, back) / points.length;
  const target: V = [
    right[0] * centreR + up[0] * centreU + back[0] * mean,
    right[1] * centreR + up[1] * centreU + back[1] * mean,
    right[2] * centreR + up[2] * centreU + back[2] * mean,
  ];
  const spanR = Math.max(maxR - minR, 1e-3);
  const spanU = Math.max(maxU - minU, 1e-3);
  const zoom = Math.min(width / spanR, height / spanU) * fill;
  const distance = mean - minB + standOff;
  return {
    position: [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance],
    target,
    zoom,
  };
}

/** Where the camera goes for `view`, for a viewport of `width` × `height` pixels. */
export function cameraViewPose(
  layout: HallLayout,
  view: CameraView,
  projection: Projection,
  viewport: { width: number; height: number; fov: number },
  fill = VIEW_FILL,
): CameraPose {
  const points = hallOutlinePoints(layout);
  const direction = CAMERA_VIEW_DIRECTIONS[view];
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  if (projection === 'orthographic') {
    return frameOrthographic(points, direction, width, height, hallRadius(layout) * 3 + 10, fill);
  }
  const { position, target } = frameView(points, direction, viewport.fov, width / height, fill);
  return { position, target, zoom: 1 };
}

/**
 * The orthographic zoom that shows the same picture height, at the target, as a perspective camera `distance` away,
 * and the other way round: used when the projection is switched, so the hall keeps its size on screen.
 */
export function zoomForDistance(distance: number, fov: number, viewportHeight: number): number {
  return viewportHeight / (2 * Math.max(distance, 1e-3) * Math.tan((fov * Math.PI) / 360));
}
export function distanceForZoom(zoom: number, fov: number, viewportHeight: number): number {
  return viewportHeight / (2 * Math.max(zoom, 1e-6) * Math.tan((fov * Math.PI) / 360));
}
