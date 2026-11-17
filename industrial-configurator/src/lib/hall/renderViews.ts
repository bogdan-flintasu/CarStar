/**
 * Camera framing of the fixed "professional" views of a hall (the renders shown in the summary and in the PDF quote).
 * Pure math on the HallLayout, no three.js: every view sees the building's real outline (walls, gables, roof skin and
 * slab) and is fitted so the hall fills `fill` of the frame on its limiting axis, centred, at any size.
 */
import type { HallLayout, Side, Vec3 } from './types';
import { wallPointToWorld } from './walls';

/** The views a quote shows, in display order. The first one is the hero picture. */
export const RENDER_VIEWS = ['front', 'rear', 'side', 'aerial'] as const;
export type RenderView = (typeof RENDER_VIEWS)[number];

export const RENDER_VIEW_LABELS: Record<RenderView, string> = {
  front: 'Vedere față',
  rear: 'Vedere spate',
  side: 'Vedere laterală',
  aerial: 'Vedere aeriană',
};

/** Share of the frame the hall fills on its limiting axis. */
export const RENDER_FILL = 0.8;

export interface ViewCamera {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
  near: number;
  far: number;
}

interface ViewSpec {
  /** From the hall towards the camera (any length); x is multiplied by the view's side sign. */
  direction: Vec3;
  fov: number;
}

/**
 * Directions for a hall seen with its "hero" long side at -X. Narrow lenses keep the verticals calm and the
 * perspective architectural; the side view is almost an elevation.
 */
const VIEW_SPECS: Record<RenderView, ViewSpec> = {
  // Eye level a little above the eaves: a strip of sky shows above the hall, as in a photo.
  front: { direction: [-0.62, 0.17, 0.78], fov: 30 },
  rear: { direction: [0.62, 0.17, -0.78], fov: 30 },
  side: { direction: [1, 0.1, 0.12], fov: 22 },
  aerial: { direction: [-0.55, 1.05, 0.72], fov: 32 },
};

/** Room for the terrain behind the hall (the ground plane is 2 km wide). */
const FAR_BEYOND = 2500;

type V = [number, number, number];
const sub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addScaled = (a: Vec3, b: Vec3, k: number): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): V => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Points on the building's outline: wall faces (gable or trapezoid ends included), roof skin corners, slab top. */
export function hallOutlinePoints(layout: HallLayout): Vec3[] {
  const points: Vec3[] = [];
  for (const wall of Object.values(layout.walls)) {
    for (const [h, v] of wall.polygon) points.push(wallPointToWorld(wall, h, v));
  }
  for (const plane of layout.roof) {
    for (const z of [plane.zFront, plane.zBack]) {
      for (const [x, y] of [plane.eave, plane.ridge]) {
        points.push([x, y, z], [x, y + plane.plumbThickness, z]);
      }
    }
  }
  if (layout.params.foundation) {
    const { w, l, centerX, centerZ, topY } = layout.slab;
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) points.push([centerX + sx * w, topY, centerZ + sz * l]);
  }
  return points;
}

/** The side of the hall the hero (front 3/4) view is taken from: the low side of a mono-pitch roof shows its slope. */
export function heroSide(layout: HallLayout): Side {
  if (layout.roofType !== 'mono') return 'left';
  return layout.highSide === 'left' ? 'right' : 'left';
}

/**
 * Camera looking along -`direction` that shows every point inside `fill` of the frame, centred.
 * The camera never rotates while it is fitted: it only slides across the view (to centre the picture) and along it
 * (to scale it), so verticals stay vertical.
 */
export function frameView(points: readonly Vec3[], direction: Vec3, fov: number, aspect: number, fill = RENDER_FILL): ViewCamera {
  const back = normalize(direction);
  const forward: V = [-back[0], -back[1], -back[2]];
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanV = Math.tan((fov * Math.PI) / 360) * fill;
  const tanH = tanV * aspect;

  const centre: V = [0, 0, 0];
  for (const p of points) for (let i = 0; i < 3; i++) centre[i] += p[i] / points.length;

  let target: V = centre;
  let distance = 0;
  for (let pass = 0; pass < 12; pass++) {
    // Distance at which every point fits a symmetric frame around the current axis.
    distance = 0;
    for (const p of points) {
      const rel = sub(p, target);
      const ahead = dot(rel, back);
      distance = Math.max(distance, Math.abs(dot(rel, right)) / tanH + ahead, Math.abs(dot(rel, up)) / tanV + ahead);
    }
    // Slide across the view so the picture is centred (perspective makes the near end look bigger).
    const position = addScaled(target, back, distance);
    let [minX, maxX, minY, maxY, depthSum] = [Infinity, -Infinity, Infinity, -Infinity, 0];
    for (const p of points) {
      const rel = sub(p, position);
      const depth = dot(rel, forward);
      const x = dot(rel, right) / depth;
      const y = dot(rel, up) / depth;
      [minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)];
      depthSum += depth;
    }
    const depth = depthSum / points.length;
    const shiftX = ((minX + maxX) / 2) * depth;
    const shiftY = ((minY + maxY) / 2) * depth;
    if (Math.abs(shiftX) + Math.abs(shiftY) < 1e-6) break;
    target = addScaled(addScaled(target, right, shiftX), up, shiftY);
  }

  const position = addScaled(target, back, distance);
  let nearest = Infinity;
  let farthest = 0;
  for (const p of points) {
    const depth = dot(sub(p, position), forward);
    nearest = Math.min(nearest, depth);
    farthest = Math.max(farthest, depth);
  }
  return { position, target, fov, near: Math.max(0.1, nearest * 0.5), far: farthest + FAR_BEYOND };
}

/** Cameras of every render view for this hall, for pictures of the given aspect ratio (width / height). */
export function renderViewCameras(layout: HallLayout, aspect: number, fill = RENDER_FILL): Record<RenderView, ViewCamera> {
  const points = hallOutlinePoints(layout);
  const sign = heroSide(layout) === 'left' ? 1 : -1;
  const cameras = {} as Record<RenderView, ViewCamera>;
  for (const view of RENDER_VIEWS) {
    const { direction, fov } = VIEW_SPECS[view];
    cameras[view] = frameView(points, [direction[0] * sign, direction[1], direction[2]], fov, aspect, fill);
  }
  return cameras;
}

/** Height of the sun in the quote renders: a summer midday, as in the sky picture used for them. */
export const SUN_ELEVATION_DEG = 48;
/** Where the sun is in that sky picture (azimuth as atan2(z, x) in three.js' equirectangular mapping, degrees). */
export const SKY_SUN_AZIMUTH_DEG = 34.2;
/**
 * The sun stands this far to one side of the camera: the faces in view are lit, one of them more than the other, and the
 * hall's shadow falls into the picture.
 */
export const SUN_OFFSET_DEG = 60;

export interface ViewSun {
  /** Unit vector towards the sun. */
  direction: Vec3;
  /** Rotation about +Y to give the sky (background and environment light) so its own sun matches `direction`. */
  skyRotationY: number;
}

/**
 * The sun of one render: behind the photographer, a little to the side, at summer-midday height. Every picture is
 * front-lit, as a photographer would choose the time of day for each shot. Mirrored with the hero side, so a hall
 * seen from the right is lit like its mirror image.
 */
export function sunForView(camera: ViewCamera, layout: HallLayout): ViewSun {
  const sign = heroSide(layout) === 'left' ? 1 : -1;
  const cameraAzimuth = Math.atan2(camera.position[2] - camera.target[2], camera.position[0] - camera.target[0]);
  const azimuth = cameraAzimuth - (sign * SUN_OFFSET_DEG * Math.PI) / 180;
  const elevation = (SUN_ELEVATION_DEG * Math.PI) / 180;
  const direction: Vec3 = [
    Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.sin(azimuth) * Math.cos(elevation),
  ];
  // three.js turns the sky by +rotation (R_y(θ) maps azimuth φ to φ − θ).
  return { direction, skyRotationY: (SKY_SUN_AZIMUTH_DEG * Math.PI) / 180 - azimuth };
}
