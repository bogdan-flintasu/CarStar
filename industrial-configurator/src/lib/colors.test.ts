import { describe, expect, it } from 'vitest';
import {
  COLOR_COMPONENTS,
  DEFAULT_PALETTE,
  defaultColors,
  resolveColors,
  surchargeRates,
  type ColorOption,
} from './colors';
import { calculatePrice, colorQuantities, DEFAULT_PRICES } from './pricing';
import { colorPaletteSchema } from './validation/colors';

const palette: ColorOption[] = DEFAULT_PALETTE.map((o) =>
  o.id === 'walls-ral5010' ? { ...o, surcharge: 4 } : o.id === 'doors-ral9005' ? { ...o, surcharge: 50 } : o,
);

describe('colour catalogue', () => {
  it('has exactly one default per component, black trims and a valid shape', () => {
    for (const c of COLOR_COMPONENTS) {
      expect(DEFAULT_PALETTE.filter((o) => o.component === c && o.isDefault)).toHaveLength(1);
    }
    expect(defaultColors().trims.name).toBe('Negru');
    expect(colorPaletteSchema.safeParse(DEFAULT_PALETTE).success).toBe(true);
  });

  it('falls back to the default for unknown ids or ids of another component', () => {
    const colors = resolveColors({ walls: { id: 'nope' }, roof: { id: 'walls-ral5010' } }, palette);
    expect(colors.walls.id).toBe('walls-ral9002');
    expect(colors.roof.id).toBe('roof-ral7016');
  });

  it('takes names and hexes from the catalogue, not from the client', () => {
    const colors = resolveColors({ walls: { id: 'walls-ral5010', name: 'free', hex: '#000000' } as never }, palette);
    expect(colors.walls).toEqual({ id: 'walls-ral5010', name: 'Albastru', hex: '#13447c' });
  });

  it('adds each surcharge times its quantity to the price', () => {
    const params = { length: 24, width: 12, height: 4, showFoundation: false, hasSandwichPanels: false };
    const counts = { windows: 0, doors: 1, garageDoors: 2 };
    const base = calculatePrice(params, counts, DEFAULT_PRICES);
    const rates = surchargeRates({ walls: { id: 'walls-ral5010' }, doors: { id: 'doors-ral9005' } }, palette);
    const wallArea = colorQuantities(params, counts).walls;
    expect(wallArea).toBe(2 * 24 * 4 + 2 * 12 * 4);
    expect(calculatePrice(params, counts, DEFAULT_PRICES, rates)).toBe(Math.round(base + 4 * wallArea + 50 * 3));
    expect(calculatePrice(params, counts, DEFAULT_PRICES, surchargeRates(undefined, palette))).toBe(base);
  });

  it('rejects a catalogue without a default or with duplicate ids', () => {
    const noDefault = DEFAULT_PALETTE.map((o) => (o.component === 'roof' ? { ...o, isDefault: false } : o));
    expect(colorPaletteSchema.safeParse(noDefault).success).toBe(false);
    expect(colorPaletteSchema.safeParse([...DEFAULT_PALETTE, DEFAULT_PALETTE[0]]).success).toBe(false);
  });
});
