import { describe, it, expect } from 'vitest';
import { calculatePrice, countOpenings, DEFAULT_PRICES } from './pricing';

const base = { length: 12, width: 12, height: 3, showFoundation: false, hasSandwichPanels: false };
const none = { windows: 0, doors: 0, garageDoors: 0 };

describe('calculatePrice', () => {
  it('prices structure by volume', () => {
    expect(calculatePrice(base, none, DEFAULT_PRICES)).toBe(12 * 12 * 3 * 45);
  });
  it('adds foundation by floor area', () => {
    expect(calculatePrice({ ...base, showFoundation: true }, none)).toBe(19440 + 144 * 35);
  });
  it('adds sandwich panels by wall area only', () => {
    expect(calculatePrice({ ...base, hasSandwichPanels: true }, none)).toBe(19440 + 2 * 36 * 2 * 25);
  });
  it('adds openings from counts or from a list', () => {
    const expected = 19440 + 2 * 150 + 300 + 800;
    expect(calculatePrice(base, { windows: 2, doors: 1, garageDoors: 1 })).toBe(expected);
    const list = [{ type: 'window' }, { type: 'window' }, { type: 'door' }, { type: 'garageDoor' }];
    expect(calculatePrice(base, list)).toBe(expected);
  });
  it('uses custom prices and rounds', () => {
    const p = { ...DEFAULT_PRICES, structurePerM3: 10.5 };
    expect(calculatePrice({ ...base, length: 13 }, none, p)).toBe(Math.round(13 * 12 * 3 * 10.5));
  });
  it('countOpenings ignores unknown types', () => {
    expect(countOpenings([{ type: 'x' }])).toEqual(none);
  });
});
