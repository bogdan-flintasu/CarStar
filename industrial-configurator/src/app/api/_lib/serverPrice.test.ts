import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICES, type Prices } from '@/lib/pricing';
import { configurationDataSchema } from '@/lib/validation/configuration';
import { pickPrices, resolveEmailSummary, trustedOpeningCounts, withServerPrice } from './serverPrice';

// 12x12x3, foundation, no sandwich, 1 window at default prices:
// 432 m3 * 45 + 1 * 150 + 144 m2 * 35 = 19440 + 150 + 5040 = 24630
const EXPECTED = 24630;

const base = configurationDataSchema.parse({
  dimensions: { length: 12, width: 12, height: 3 },
  foundation: true,
  sandwichPanels: false,
  insulation: 0,
  openings: { windows: 1, doors: 0, garageDoors: 0 },
  floorArea: 1,
  estimatedPrice: 1,
});

const window = { id: 'w1', type: 'window', wallId: 'PereteFata', offsetX: 1, sill: 1, width: 1, height: 1 };

describe('withServerPrice', () => {
  it('ignores a tampered client price and floor area', () => {
    const priced = withServerPrice(base, DEFAULT_PRICES);
    expect(priced.estimatedPrice).toBe(EXPECTED);
    expect(priced.floorArea).toBe(144);
    expect(priced.dimensions).toEqual(base.dimensions);
  });

  it('uses the given (DB) prices, not the defaults', () => {
    const prices: Prices = { ...DEFAULT_PRICES, structurePerM3: 100 };
    expect(withServerPrice(base, prices).estimatedPrice).toBe(432 * 100 + 150 + 144 * 35);
  });

  it('prices sandwich panels by wall area', () => {
    const priced = withServerPrice({ ...base, sandwichPanels: true }, DEFAULT_PRICES);
    expect(priced.estimatedPrice).toBe(EXPECTED + (2 * 12 * 3 + 2 * 12 * 3) * 25);
  });

  it('counts openings from openingsList over client-sent counts', () => {
    const data = configurationDataSchema.parse({
      ...base,
      openings: { windows: 0, doors: 0, garageDoors: 0 },
      openingsList: [window, { ...window, id: 'g1', type: 'garageDoor' }],
    });
    expect(trustedOpeningCounts(data)).toEqual({ windows: 1, doors: 0, garageDoors: 1 });
    const priced = withServerPrice(data, DEFAULT_PRICES);
    expect(priced.openings).toEqual({ windows: 1, doors: 0, garageDoors: 1 });
    expect(priced.estimatedPrice).toBe(EXPECTED + 800);
  });

  it('falls back to the counts without a list, and to zero without either', () => {
    expect(trustedOpeningCounts(base)).toEqual({ windows: 1, doors: 0, garageDoors: 0 });
    const { openings: _omit, ...noCounts } = base;
    void _omit;
    expect(trustedOpeningCounts(noCounts)).toEqual({ windows: 0, doors: 0, garageDoors: 0 });
    expect(withServerPrice(noCounts, DEFAULT_PRICES).estimatedPrice).toBe(EXPECTED - 150);
  });
});

describe('resolveEmailSummary', () => {
  it('prefers the saved configuration behind the link over the client summary', () => {
    const stored = { ...base, dimensions: { length: 24, width: 12, height: 3 }, estimatedPrice: 5 };
    const summary = resolveEmailSummary(stored, base, DEFAULT_PRICES);
    expect(summary?.dimensions.length).toBe(24);
    expect(summary?.estimatedPrice).toBe(864 * 45 + 150 + 288 * 35);
  });

  it('reprices the client summary when there is no link', () => {
    expect(resolveEmailSummary(undefined, base, DEFAULT_PRICES)?.estimatedPrice).toBe(EXPECTED);
  });

  it('falls back to the client summary when the saved row is legacy/invalid', () => {
    const summary = resolveEmailSummary({ dimensions: 'bogus' }, base, DEFAULT_PRICES);
    expect(summary?.estimatedPrice).toBe(EXPECTED);
  });

  it('returns null without any summary', () => {
    expect(resolveEmailSummary(undefined, null, DEFAULT_PRICES)).toBeNull();
  });
});

describe('pickPrices', () => {
  it('drops DB-only columns', () => {
    const row = { ...DEFAULT_PRICES, id: 'x', updatedAt: new Date() };
    expect(pickPrices(row)).toEqual(DEFAULT_PRICES);
  });
});
