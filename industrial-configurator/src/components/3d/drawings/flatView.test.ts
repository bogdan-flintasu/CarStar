import { describe, expect, it } from 'vitest';
import { buildDrawing, computeHallLayout, drawingPointToWorld, type HallParams } from '@/lib/hall';
import { CAMERA_VIEWS } from '@/lib/hall/cameraViews';
import { drawingForView, facesCamera, metresPerPixel, sheetLift, sheetMatrix } from './flatView';

const params: HallParams = { length: 30, width: 15, height: 5, foundation: true, panels: true, insulationMm: 100 };

describe('drawingForView', () => {
  it('maps the axis views to their drawing in the orthographic projection', () => {
    expect(drawingForView('front', 'orthographic')).toBe('front');
    expect(drawingForView('back', 'orthographic')).toBe('back');
    expect(drawingForView('left', 'orthographic')).toBe('left');
    expect(drawingForView('right', 'orthographic')).toBe('right');
    expect(drawingForView('top', 'orthographic')).toBe('plan');
  });

  it('shows nothing in perspective, in the 3D view or after the user orbited away', () => {
    for (const view of CAMERA_VIEWS) expect(drawingForView(view, 'perspective')).toBeNull();
    expect(drawingForView('iso', 'orthographic')).toBeNull();
    expect(drawingForView(null, 'orthographic')).toBeNull();
    expect(drawingForView(null, 'perspective')).toBeNull();
  });
});

describe('metresPerPixel', () => {
  it('is the inverse of the orthographic zoom (pixels per metre)', () => {
    expect(metresPerPixel(20)).toBeCloseTo(0.05);
    expect(metresPerPixel(1)).toBe(1);
    // Zooming in twice halves the world size of a screen-constant label.
    expect(metresPerPixel(40) / metresPerPixel(20)).toBeCloseTo(0.5);
    expect(Number.isFinite(metresPerPixel(0))).toBe(true);
  });
});

describe.each([
  ['gable', params],
  ['mono', { ...params, roofType: 'mono', highSide: 'left' } as HallParams],
])('sheet placement, %s', (_, p) => {
  const layout = computeHallLayout(p);

  it.each(['front', 'back', 'left', 'right', 'top'] as const)('%s: the sheet faces the camera and stands in front of the hall', (view) => {
    const drawing = buildDrawing(layout, drawingForView(view, 'orthographic')!);
    expect(facesCamera(drawing.toWorld, view)).toBe(true);

    const lift = sheetLift(layout, drawing.toWorld);
    const m = sheetMatrix(drawing.toWorld, lift);
    // The matrix maps sheet (x, y, 0) like drawingPointToWorld, then lifts it along the view direction.
    const sheetPoint: [number, number] = [3, 2];
    const world = drawingPointToWorld(drawing.toWorld, sheetPoint);
    const mapped = [0, 1, 2].map((i) => m[i] * sheetPoint[0] + m[4 + i] * sheetPoint[1] + m[12 + i]);
    const n = [m[8], m[9], m[10]];
    mapped.forEach((v, i) => expect(v).toBeCloseTo(world[i] + n[i] * lift, 6));
    // Every corner of the hall is behind the lifted sheet.
    const { min, max } = layout.bounds;
    for (const x of [min[0], max[0]]) {
      for (const y of [min[1], max[1]]) {
        for (const z of [min[2], max[2]]) {
          const depth = (x - mapped[0]) * n[0] + (y - mapped[1]) * n[1] + (z - mapped[2]) * n[2];
          expect(depth).toBeLessThan(0);
        }
      }
    }
  });
});
