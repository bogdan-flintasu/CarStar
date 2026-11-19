import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { computeHallLayout } from './computeHallLayout';
import { hallOutlinePoints } from './renderViews';
import {
  CAMERA_VIEWS,
  CAMERA_VIEW_DIRECTIONS,
  VIEW_FILL,
  cameraViewPose,
  distanceForZoom,
  zoomForDistance,
  type CameraPose,
} from './cameraViews';
import type { HallParams, Vec3 } from './types';

const base: HallParams = { length: 30, width: 15, height: 5, foundation: true, panels: true, insulationMm: 80 };
const viewport = { width: 1200, height: 800, fov: 75 };

/** Extents of the points in normalised device coordinates, as a real three.js orthographic camera projects them. */
function orthoExtents(pose: CameraPose, points: readonly Vec3[], width: number, height: number) {
  const cam = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 6000);
  cam.zoom = pose.zoom;
  cam.position.set(...pose.position);
  cam.lookAt(new Vector3(...pose.target));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  let [minX, maxX, minY, maxY, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const p of points) {
    const ndc = new Vector3(...p).project(cam);
    [minX, maxX, minY, maxY] = [Math.min(minX, ndc.x), Math.max(maxX, ndc.x), Math.min(minY, ndc.y), Math.max(maxY, ndc.y)];
    [minZ, maxZ] = [Math.min(minZ, ndc.z), Math.max(maxZ, ndc.z)];
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

describe('fixed camera views', () => {
  for (const roofType of ['gable', 'mono'] as const) {
    const layout = computeHallLayout({ ...base, roofType });
    const points = hallOutlinePoints(layout);

    for (const view of CAMERA_VIEWS) {
      it(`${roofType} ${view}: orthographic view is centred, fits ${VIEW_FILL} of the frame and clips nothing`, () => {
        const pose = cameraViewPose(layout, view, 'orthographic', viewport);
        const e = orthoExtents(pose, points, viewport.width, viewport.height);
        expect(e.minX + e.maxX).toBeCloseTo(0, 5);
        expect(e.minY + e.maxY).toBeCloseTo(0, 5);
        const fill = Math.max(e.maxX - e.minX, e.maxY - e.minY) / 2;
        expect(fill).toBeCloseTo(VIEW_FILL, 5);
        expect(e.minZ).toBeGreaterThan(-1);
        expect(e.maxZ).toBeLessThan(1);
      });

      it(`${roofType} ${view}: perspective camera looks along the view axis`, () => {
        const pose = cameraViewPose(layout, view, 'perspective', viewport);
        const d = new Vector3(...pose.position).sub(new Vector3(...pose.target)).normalize();
        const expected = new Vector3(...CAMERA_VIEW_DIRECTIONS[view]).normalize();
        expect(d.dot(expected)).toBeGreaterThan(0.9999);
        expect(pose.zoom).toBe(1);
      });
    }
  }

  it('front looks at the front gable from +Z, left at the left wall from -X, plan from above', () => {
    const layout = computeHallLayout(base);
    const { min, max } = layout.bounds;
    expect(cameraViewPose(layout, 'front', 'orthographic', viewport).position[2]).toBeGreaterThan(max[2]);
    expect(cameraViewPose(layout, 'back', 'orthographic', viewport).position[2]).toBeLessThan(min[2]);
    expect(cameraViewPose(layout, 'left', 'orthographic', viewport).position[0]).toBeLessThan(min[0]);
    expect(cameraViewPose(layout, 'right', 'orthographic', viewport).position[0]).toBeGreaterThan(max[0]);
    expect(cameraViewPose(layout, 'top', 'orthographic', viewport).position[1]).toBeGreaterThan(max[1]);
  });

  it('a longer hall gets a smaller zoom in the side elevation, the same in the front one', () => {
    const short = computeHallLayout(base);
    const long = computeHallLayout({ ...base, length: 60 });
    const side = (l: typeof short) => cameraViewPose(l, 'left', 'orthographic', viewport).zoom;
    const front = (l: typeof short) => cameraViewPose(l, 'front', 'orthographic', viewport).zoom;
    expect(side(long)).toBeLessThan(side(short));
    expect(front(long)).toBeCloseTo(front(short), 5);
  });

  it('projection switch keeps the picture size: zoom and distance convert both ways', () => {
    const zoom = zoomForDistance(40, 75, 800);
    expect(distanceForZoom(zoom, 75, 800)).toBeCloseTo(40, 8);
    // Visible height at the target is the same for both cameras.
    expect(800 / zoom).toBeCloseTo(2 * 40 * Math.tan((75 * Math.PI) / 360), 8);
  });
});
