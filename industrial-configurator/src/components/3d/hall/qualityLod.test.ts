import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { computeHallLayout } from '@/lib/hall';
import { placeKit } from './placements';
import {
  BOLT_CHUNK_LENGTH_M,
  BOLT_DETAIL_SIZE_M,
  MIN_DETAIL_PX,
  chunkAlongZ,
  detailVisible,
  estimateHallCost,
  projectedSizePx,
  type DetailView,
} from './qualityLod';

const at = (z: number, x = 0) => new Matrix4().makeTranslation(x, 0, z);
const VIEW: DetailView = { kind: 'perspective', fovDeg: 45, zoom: 1, viewportHeightPx: 900 };

describe('estimateHallCost', () => {
  it('sums instances x triangles, twice for shadow casters, biggest first', () => {
    const cost = estimateHallCost([
      { name: 'Column', instances: 10, trianglesEach: 100, castsShadow: true },
      { name: 'Bolt', instances: 100, trianglesEach: 56 },
      { name: 'RidgeCap', instances: 0, trianglesEach: 30 },
    ]);
    expect(cost.triangles).toBe(10 * 100 * 2 + 100 * 56);
    expect(cost.instances).toBe(110);
    expect(cost.byPiece.map((p) => p.name)).toEqual(['Bolt', 'Column']);
  });

  it('grows with the hall: a 102 m hall costs several times a 12 m one', () => {
    const costOf = (width: number, length: number, height: number) => {
      const placements = placeKit(computeHallLayout({ width, length, height, foundation: true, panels: false, insulationMm: 60 }));
      return estimateHallCost(
        Object.entries(placements).map(([name, list]) => ({ name, instances: list.length, trianglesEach: 100 })),
      ).triangles;
    };
    const small = costOf(12, 12, 4);
    const long = costOf(20, 102, 6);
    expect(long).toBeGreaterThan(4 * small);
  });
});

describe('chunkAlongZ', () => {
  it('groups by floor(z / length), front to back, keeping the order inside a chunk', () => {
    const matrices = [at(1, 1), at(-13), at(11, 2), at(-1), at(5, 3)];
    const chunks = chunkAlongZ(matrices, 12);
    expect(chunks.map((chunk) => chunk.map((m) => m.elements[14]))).toEqual([[1, 11, 5], [-1], [-13]]);
    expect(chunks[0].map((m) => m.elements[12])).toEqual([1, 2, 3]);
  });

  it('keeps every instance', () => {
    const matrices = Array.from({ length: 500 }, (_, i) => at(51 - i * 0.2));
    const chunks = chunkAlongZ(matrices);
    expect(chunks.flat()).toHaveLength(500);
    expect(chunks.length).toBe(Math.ceil(100 / BOLT_CHUNK_LENGTH_M) + 1);
  });

  it('nothing in, nothing out', () => {
    expect(chunkAlongZ([])).toEqual([]);
  });
});

describe('projectedSizePx / detailVisible', () => {
  it('halves with twice the distance (perspective)', () => {
    const near = projectedSizePx(1, 10, VIEW);
    expect(projectedSizePx(1, 20, VIEW)).toBeCloseTo(near / 2);
    // 1 m at 10 m, 45 degree vertical field of view, 900 px tall: ~108.6 px.
    expect(near).toBeCloseTo(900 / (2 * Math.tan(Math.PI / 8)) / 10, 6);
  });

  it('zooming in makes things bigger', () => {
    expect(projectedSizePx(1, 10, { ...VIEW, zoom: 2 })).toBeCloseTo(2 * projectedSizePx(1, 10, VIEW));
  });

  it('orthographic: independent of distance, scales with zoom', () => {
    const ortho: DetailView = { kind: 'orthographic', frustumHeight: 30, zoom: 1, viewportHeightPx: 900 };
    expect(projectedSizePx(1, 5, ortho)).toBe(projectedSizePx(1, 500, ortho));
    expect(projectedSizePx(1, 5, ortho)).toBe(30);
    expect(projectedSizePx(1, 5, { ...ortho, zoom: 3 })).toBe(90);
  });

  it('bolts: drawn at close range, dropped across a whole-hall view, sooner with far detail off', () => {
    expect(detailVisible(BOLT_DETAIL_SIZE_M, 10, VIEW, MIN_DETAIL_PX.full)).toBe(true);
    expect(detailVisible(BOLT_DETAIL_SIZE_M, 30, VIEW, MIN_DETAIL_PX.full)).toBe(true);
    expect(detailVisible(BOLT_DETAIL_SIZE_M, 80, VIEW, MIN_DETAIL_PX.full)).toBe(false);
    expect(detailVisible(BOLT_DETAIL_SIZE_M, 30, VIEW, MIN_DETAIL_PX.reduced)).toBe(false);
  });

  it('the camera inside a chunk (distance 0) always draws it', () => {
    expect(detailVisible(BOLT_DETAIL_SIZE_M, 0, VIEW, MIN_DETAIL_PX.reduced)).toBe(true);
  });
});
