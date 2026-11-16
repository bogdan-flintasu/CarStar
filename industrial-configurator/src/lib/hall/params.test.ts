import { describe, expect, it } from 'vitest';
import { HALL_LIMITS, MAX_BAY_SPACING } from './constants';
import { clampHallDimensions, parseHallUrlParams, resolveHallParams } from './params';

describe('parseHallUrlParams', () => {
  it.each([
    ['?w=13.5&h=4&l=30&step=1', { width: 13.5, height: 4, length: 30, step: 1 }],
    ['w=12', { width: 12 }],
    ['?l=17', { length: 17 }],
    ['', {}],
    ['?w=abc&h=&l=%20', {}],
    ['?w=99&h=1&l=5', { width: 20, height: 3, length: 12 }],
    ['?w=-4&l=1000', { width: 8, length: 102 }],
    ['?step=3', { step: 3 }],
    ['?step=5&w=10', { width: 10 }],
    ['?step=1.5', {}],
    ['?w=Infinity', {}],
  ])('%s', (search, expected) => {
    expect(parseHallUrlParams(search)).toEqual(expected);
  });
});

describe('clampHallDimensions', () => {
  it('leaves sellable sizes alone, including non-integers', () => {
    const size = { width: 13.5, height: 4.2, length: 31 };
    expect(clampHallDimensions(size)).toEqual(size);
  });

  it('clamps to the limits and replaces garbage with the minimum', () => {
    expect(clampHallDimensions({ width: 25, height: 2, length: NaN })).toEqual({
      width: HALL_LIMITS.width.max,
      height: HALL_LIMITS.height.min,
      length: HALL_LIMITS.length.min,
    });
  });
});

describe('resolveHallParams', () => {
  it('defaults the bay to the maximum spacing', () => {
    const resolved = resolveHallParams({
      length: 12,
      width: 12,
      height: 3,
      foundation: false,
      panels: false,
      insulationMm: 0,
    });
    expect(resolved.bay).toBe(MAX_BAY_SPACING);
  });
});
