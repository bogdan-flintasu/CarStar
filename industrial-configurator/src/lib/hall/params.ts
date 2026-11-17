/** Validation, clamping and URL parsing of hall parameters. Pure; no DOM access. */
import { HALL_LIMITS, MAX_BAY_SPACING } from './constants';
import type { HallParams } from './types';

export interface HallDimensions {
  width: number;
  height: number;
  length: number;
}

function requirePositive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`computeHallLayout: ${name} must be a positive number, got ${value}`);
  }
  return value;
}

/** Fills defaults and rejects sizes no hall can have (NaN, zero, negative). Does not clamp to HALL_LIMITS. */
export function resolveHallParams(params: HallParams): Required<HallParams> {
  return {
    length: requirePositive('length', params.length),
    width: requirePositive('width', params.width),
    height: requirePositive('height', params.height),
    bay: requirePositive('bay', params.bay ?? MAX_BAY_SPACING),
    foundation: params.foundation,
    panels: params.panels,
    insulationMm: Number.isFinite(params.insulationMm) ? Math.max(0, params.insulationMm) : 0,
    roofType: params.roofType === 'mono' ? 'mono' : 'gable',
    highSide: params.highSide === 'left' ? 'left' : 'right',
  };
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

/** Brings dimensions into the range the product sells. Non-finite values fall back to the minimum. */
export function clampHallDimensions({ width, height, length }: HallDimensions): HallDimensions {
  const orMin = (value: number, limits: { min: number; max: number }) =>
    Number.isFinite(value) ? clamp(value, limits) : limits.min;
  return {
    width: orMin(width, HALL_LIMITS.width),
    height: orMin(height, HALL_LIMITS.height),
    length: orMin(length, HALL_LIMITS.length),
  };
}

export interface HallUrlParams extends Partial<HallDimensions> {
  step?: 1 | 2 | 3 | 4;
}

/**
 * Reads `?w=13.5&h=4&l=30&step=1` (the D10 verification hook). Dimensions are clamped to HALL_LIMITS;
 * anything missing or unparsable is left out so the caller keeps its current value.
 */
export function parseHallUrlParams(search: string): HallUrlParams {
  const query = new URLSearchParams(search);
  const number = (key: string): number | undefined => {
    const raw = query.get(key);
    if (raw === null || raw.trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  const result: HallUrlParams = {};
  const width = number('w');
  const height = number('h');
  const length = number('l');
  const step = number('step');
  if (width !== undefined) result.width = clamp(width, HALL_LIMITS.width);
  if (height !== undefined) result.height = clamp(height, HALL_LIMITS.height);
  if (length !== undefined) result.length = clamp(length, HALL_LIMITS.length);
  if (step === 1 || step === 2 || step === 3 || step === 4) result.step = step;
  return result;
}
