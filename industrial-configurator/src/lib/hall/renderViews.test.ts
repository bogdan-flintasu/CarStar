import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { computeHallLayout } from './computeHallLayout';
import { RENDER_FILL, RENDER_VIEWS, hallOutlinePoints, heroSide, renderViewCameras, type ViewCamera } from './renderViews';
import type { HallParams, Vec3 } from './types';

const ASPECT = 16 / 10;
const base: HallParams = { length: 12, width: 12, height: 4, foundation: true, panels: true, insulationMm: 80 };

/** Extents of the points in normalised device coordinates, projected by a real three.js camera. */
function projectedExtents(camera: ViewCamera, points: readonly Vec3[], aspect = ASPECT) {
  const cam = new PerspectiveCamera(camera.fov, aspect, camera.near, camera.far);
  cam.position.set(...camera.position);
  cam.lookAt(new Vector3(...camera.target));
  cam.updateMatrixWorld();
  let [minX, maxX, minY, maxY, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const p of points) {
    const ndc = new Vector3(...p).project(cam);
    [minX, maxX] = [Math.min(minX, ndc.x), Math.max(maxX, ndc.x)];
    [minY, maxY] = [Math.min(minY, ndc.y), Math.max(maxY, ndc.y)];
    [minZ, maxZ] = [Math.min(minZ, ndc.z), Math.max(maxZ, ndc.z)];
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const SIZES: Partial<HallParams>[] = [
  { width: 8, height: 3, length: 12 },
  { width: 20, height: 6, length: 102 },
  { width: 12, height: 4, length: 48 },
  { width: 8, height: 6, length: 102 },
  { width: 20, height: 3, length: 12 },
  { width: 15, height: 5, length: 30, roofType: 'mono', highSide: 'right' },
  { width: 15, height: 5, length: 30, roofType: 'mono', highSide: 'left' },
  { width: 20, height: 6, length: 102, roofType: 'mono', highSide: 'left', foundation: false },
];

describe('renderViewCameras', () => {
  for (const size of SIZES) {
    const layout = computeHallLayout({ ...base, ...size });
    const points = hallOutlinePoints(layout);
    const cameras = renderViewCameras(layout, ASPECT);

    for (const view of RENDER_VIEWS) {
      it(`${view}: fills ~80% of the frame, centred (${JSON.stringify(size)})`, () => {
        const e = projectedExtents(cameras[view], points);
        // The whole hall is inside the frame and in front of the camera, between near and far.
        expect(Math.max(-e.minX, e.maxX, -e.minY, e.maxY)).toBeLessThanOrEqual(RENDER_FILL + 1e-3);
        expect(e.minZ).toBeGreaterThan(-1);
        expect(e.maxZ).toBeLessThan(1);
        // The limiting axis is filled to RENDER_FILL...
        const fillX = (e.maxX - e.minX) / 2;
        const fillY = (e.maxY - e.minY) / 2;
        expect(Math.max(fillX, fillY)).toBeCloseTo(RENDER_FILL, 2);
        // ...and the picture is centred on both axes.
        expect(Math.abs(e.maxX + e.minX)).toBeLessThan(0.01);
        expect(Math.abs(e.maxY + e.minY)).toBeLessThan(0.01);
      });
    }
  }

  it('keeps the camera above the ground and the target on the hall', () => {
    const layout = computeHallLayout({ ...base, width: 20, height: 6, length: 102 });
    for (const camera of Object.values(renderViewCameras(layout, ASPECT))) {
      expect(camera.position[1]).toBeGreaterThan(layout.params.height);
      expect(camera.target[2]).toBeLessThan(0);
      expect(camera.target[2]).toBeGreaterThan(-layout.params.length);
    }
  });

  it('is deterministic', () => {
    const layout = computeHallLayout({ ...base, width: 13, length: 30 });
    expect(renderViewCameras(layout, ASPECT)).toEqual(renderViewCameras(layout, ASPECT));
  });

  it('works for other aspect ratios', () => {
    const layout = computeHallLayout({ ...base, width: 9, length: 60 });
    const points = hallOutlinePoints(layout);
    const camera = renderViewCameras(layout, 1)['front'];
    const e = projectedExtents(camera, points, 1);
    expect(Math.max((e.maxX - e.minX) / 2, (e.maxY - e.minY) / 2)).toBeCloseTo(RENDER_FILL, 2);
  });
});

describe('heroSide', () => {
  it('shows a gable hall from the left, a mono-pitch hall from its low side', () => {
    expect(heroSide(computeHallLayout(base))).toBe('left');
    expect(heroSide(computeHallLayout({ ...base, roofType: 'mono', highSide: 'right' }))).toBe('left');
    expect(heroSide(computeHallLayout({ ...base, roofType: 'mono', highSide: 'left' }))).toBe('right');
  });

  it('takes the side view from the high side of a mono-pitch hall', () => {
    for (const highSide of ['left', 'right'] as const) {
      const layout = computeHallLayout({ ...base, roofType: 'mono', highSide });
      const side = renderViewCameras(layout, ASPECT).side;
      expect(Math.sign(side.position[0])).toBe(highSide === 'left' ? -1 : 1);
    }
  });
});

describe('hallOutlinePoints', () => {
  it('reaches the top of the roof skin', () => {
    const layout = computeHallLayout({ ...base, width: 20 });
    const top = Math.max(...hallOutlinePoints(layout).map((p) => p[1]));
    expect(top).toBeCloseTo(layout.bounds.max[1], 1);
  });
});
