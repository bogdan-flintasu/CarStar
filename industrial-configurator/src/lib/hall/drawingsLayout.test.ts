import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import { buildDrawing, type DrawingOpening } from './drawings';
import { fitDrawing, fitPlacedDrawing, paperScaleDenominator, placeDrawing, type AnnotationSpacing } from './drawingsLayout';
import type { HallParams } from './types';

const SPACING: AnnotationSpacing = { first: 20, gap: 14, sillGap: 8, textOffset: 2, fontSize: 6, bubbleGap: 8, bubbleRadius: 5 };
const params: HallParams = { length: 102, width: 20, height: 6, foundation: true, panels: false, insulationMm: 0 };
const OPENINGS: DrawingOpening[] = [
  { id: 'w', type: 'window', wallId: 'PereteFata', offsetX: 1.5, sill: 1, width: 1.2, height: 1 },
  { id: 'g', type: 'garageDoor', wallId: 'PereteFata', offsetX: 8, sill: 0, width: 4, height: 4 },
];

describe('fitDrawing', () => {
  it('takes the limiting axis and centres the drawing', () => {
    const fit = fitDrawing({ min: [0, 0], max: [10, 5] }, { width: 100, height: 100 });
    expect(fit.scale).toBe(10);
    // 100 × 50 centred in 100 × 100: x from 0, top at 25 (screen y down).
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(75);
    expect(fitDrawing({ min: [-5, 0], max: [5, 40] }, { width: 100, height: 200 }).scale).toBe(5);
  });

  it('keeps the fixed margins free', () => {
    const fit = fitDrawing({ min: [0, 0], max: [10, 5] }, { width: 120, height: 100 }, { left: 10, right: 10, top: 0, bottom: 0 });
    expect(fit.scale).toBe(10);
    expect(fit.offsetX).toBe(10);
  });
});

describe('placeDrawing', () => {
  const layout = computeHallLayout(params);
  const front = buildDrawing(layout, 'front', OPENINGS);

  it('keeps rows a constant screen distance apart at any scale', () => {
    for (const unit of [0.01, 0.1, 0.5]) {
      const placed = placeDrawing(front, unit, SPACING);
      const rows = placed.chains.filter((c) => c.direction === 'x').sort((a, b) => b.line - a.line);
      for (let i = 1; i < rows.length; i += 1) expect((rows[i - 1].line - rows[i].line) / unit).toBeCloseTo(SPACING.gap, 6);
      // The first row stands `first` units below the drawing.
      expect((placed.core.min[1] - rows[0].line) / unit).toBeCloseTo(SPACING.first, 6);
    }
  });

  it('puts sill dimensions next to their opening and keeps values', () => {
    const placed = placeDrawing(front, 0.05, SPACING);
    const sill = placed.chains.find((c) => c.id === 'sill:w')!;
    expect(sill.line).toBeCloseTo(sill.base - SPACING.sillGap * 0.05, 6);
    expect(placed.chains.map((c) => c.segments.map((s) => s.text))).toEqual(front.dimensions.map((c) => c.segments.map((s) => s.text)));
  });

  it('flags texts wider than their segment', () => {
    const tiny = placeDrawing(front, 1, SPACING); // 1 m per unit: nothing short fits
    expect(tiny.chains.flatMap((c) => c.segments).some((s) => !s.fits)).toBe(true);
    const big = placeDrawing(front, 0.001, SPACING);
    expect(big.chains.flatMap((c) => c.segments).every((s) => s.fits)).toBe(true);
  });
});

describe('fitPlacedDrawing', () => {
  it.each(['front', 'left', 'plan', 'section'] as const)('%s fits the box, annotations included', (view) => {
    const drawing = buildDrawing(computeHallLayout(params), view, OPENINGS);
    const box = { width: 515, height: 260 };
    const { fit, placed } = fitPlacedDrawing(drawing, box, SPACING);
    const toScreen = ([x, y]: readonly [number, number]) => [fit.offsetX + x * fit.scale, fit.offsetY - y * fit.scale];
    const [x0, y1] = toScreen(placed.extent.min);
    const [x1, y0] = toScreen(placed.extent.max);
    expect(x0).toBeGreaterThanOrEqual(-0.5);
    expect(y0).toBeGreaterThanOrEqual(-0.5);
    expect(x1).toBeLessThanOrEqual(box.width + 0.5);
    expect(y1).toBeLessThanOrEqual(box.height + 0.5);
  });
});

describe('paperScaleDenominator', () => {
  it('rounds to familiar scales', () => {
    // 1:100 is 10 mm per metre = 28.35 pt per metre.
    expect(paperScaleDenominator(72 / 2.54)).toBe(100);
    expect(paperScaleDenominator(72 / 25.4 / 0.2)).toBe(200);
    expect(paperScaleDenominator(4.7)).toBe(600);
    expect(paperScaleDenominator(1)).toBe(2800);
  });
});
