import { describe, expect, it } from 'vitest';
import { TREE_CROWN, TREE_VARIANTS } from '@/lib/hall/propPlan';
import { TREE_SHAPES } from './props';

describe('tree species', () => {
  it('the placement plan and the render layer agree on the species and their crown sizes', () => {
    expect(TREE_SHAPES).toHaveLength(TREE_VARIANTS);
    TREE_SHAPES.forEach((shape, i) => {
      const crown = Math.max(shape.crown.rx, shape.crown.rz) * (shape.crown.lobes > 1 ? 1.25 : 1);
      expect(TREE_CROWN[i]).toBeGreaterThanOrEqual(crown * 0.9);
      expect(TREE_CROWN[i]).toBeLessThanOrEqual(crown * 1.4);
    });
  });
});
