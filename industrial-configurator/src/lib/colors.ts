/**
 * Colour catalogue of the hall: which parts can be coloured, the suggested colours of each part and what a colour
 * costs on top of the base price. Pure data and functions, shared by the client, the server and the admin.
 *
 * The admin owns the catalogue (`ColorOption` rows in the DB, see /api/admin/colors). `DEFAULT_PALETTE` below seeds
 * the DB on first use and is what the configurator shows until the DB catalogue has loaded.
 */

/** The parts of the hall a customer can colour. The concrete slab is never coloured. */
export const COLOR_COMPONENTS = ['walls', 'roof', 'steel', 'trims', 'doors', 'windows'] as const;
export type ColorComponent = (typeof COLOR_COMPONENTS)[number];

/** One colour the admin offers for one component. */
export interface ColorOption {
  id: string;
  component: ColorComponent;
  /** Shown to the customer, e.g. "Antracit". */
  name: string;
  /** RAL code without the prefix, e.g. "7016"; empty when the colour is not a RAL colour. */
  ral: string;
  /** `#rrggbb`, sRGB. */
  hex: string;
  /** Extra cost of this colour, in the unit of its component (`SURCHARGE_UNITS`). 0 = included in the price. */
  surcharge: number;
  /** The colour a new configuration starts with. Exactly one per component. */
  isDefault: boolean;
  sortOrder: number;
}

/** A customer's choice for one component, as saved with the configuration. */
export interface ColorChoice {
  id: string;
  name: string;
  hex: string;
}

export type HallColors = Record<ColorComponent, ColorChoice>;
/** Hex colour per component: what the 3D scene needs. */
export type HallColorHexes = Record<ColorComponent, string>;

export const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export const COMPONENT_LABELS: Record<ColorComponent, string> = {
  walls: 'Pereți',
  roof: 'Acoperiș',
  steel: 'Structură metalică',
  trims: 'Jgheaburi, coamă și borduri',
  doors: 'Uși',
  windows: 'Rame ferestre',
};

/** What a surcharge is multiplied by: see `colorQuantities` in pricing.ts. */
export const SURCHARGE_UNITS: Record<ColorComponent, string> = {
  walls: 'per m² de perete',
  roof: 'per m² de acoperiș',
  steel: 'per m² de hală',
  trims: 'per metru liniar de jgheab și coamă',
  doors: 'per ușă',
  windows: 'per fereastră',
};

type Seed = [ral: string, name: string, hex: string];

/** Suggested colours per component; the first one is the default. */
const SEED: Record<ColorComponent, Seed[]> = {
  walls: [
    ['9002', 'Alb-gri', '#e7ebda'],
    ['9010', 'Alb pur', '#f1ece1'],
    ['7035', 'Gri deschis', '#cbd0cc'],
    ['7016', 'Antracit', '#383e42'],
    ['5010', 'Albastru', '#13447c'],
    ['3009', 'Roșu oxid', '#642424'],
    ['6005', 'Verde mușchi', '#114232'],
  ],
  roof: [
    ['7016', 'Antracit', '#383e42'],
    ['9002', 'Alb-gri', '#e7ebda'],
    ['3009', 'Roșu oxid', '#642424'],
    ['8017', 'Maro ciocolată', '#45322e'],
    ['9005', 'Negru', '#0a0a0a'],
    ['6005', 'Verde mușchi', '#114232'],
  ],
  steel: [
    ['7035', 'Gri deschis', '#cbd0cc'],
    ['9006', 'Aluminiu', '#a5a8a6'],
    ['7016', 'Antracit', '#383e42'],
    ['3009', 'Roșu oxid', '#642424'],
    ['9005', 'Negru', '#0a0a0a'],
  ],
  trims: [
    ['9005', 'Negru', '#0a0a0a'],
    ['7016', 'Antracit', '#383e42'],
    ['9006', 'Aluminiu', '#a5a8a6'],
    ['9002', 'Alb-gri', '#e7ebda'],
    ['3009', 'Roșu oxid', '#642424'],
  ],
  doors: [
    ['9006', 'Aluminiu', '#a5a8a6'],
    ['7016', 'Antracit', '#383e42'],
    ['9002', 'Alb-gri', '#e7ebda'],
    ['9005', 'Negru', '#0a0a0a'],
    ['5010', 'Albastru', '#13447c'],
  ],
  windows: [
    ['7016', 'Antracit', '#383e42'],
    ['9016', 'Alb', '#f1f0ea'],
    ['9006', 'Aluminiu', '#a5a8a6'],
    ['9005', 'Negru', '#0a0a0a'],
  ],
};

/** The built-in catalogue. Ids are stable, so configurations saved against it keep resolving. */
export const DEFAULT_PALETTE: readonly ColorOption[] = COLOR_COMPONENTS.flatMap((component) =>
  SEED[component].map(([ral, name, hex], index) => ({
    id: `${component}-ral${ral}`,
    component,
    name,
    ral,
    hex,
    surcharge: 0,
    isDefault: index === 0,
    sortOrder: index,
  })),
);

export const toChoice = ({ id, name, hex }: ColorOption): ColorChoice => ({ id, name, hex });

/** The options of one component, in display order. */
export function optionsFor(palette: readonly ColorOption[], component: ColorComponent): ColorOption[] {
  return palette.filter((o) => o.component === component).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The default option of a component: the flagged one, else the first, else the built-in default. */
export function defaultOption(palette: readonly ColorOption[], component: ColorComponent): ColorOption {
  const options = optionsFor(palette, component);
  return (
    options.find((o) => o.isDefault) ??
    options[0] ??
    DEFAULT_PALETTE.find((o) => o.component === component && o.isDefault)!
  );
}

export function defaultColors(palette: readonly ColorOption[] = DEFAULT_PALETTE): HallColors {
  return Object.fromEntries(COLOR_COMPONENTS.map((c) => [c, toChoice(defaultOption(palette, c))])) as HallColors;
}

/**
 * The palette options behind a (possibly untrusted or outdated) set of choices. A choice is matched by id within its
 * component; anything unknown falls back to the component's default, so a client can never pick a colour the admin
 * does not offer, nor skip its surcharge.
 */
export function resolveColorOptions(
  choices: Partial<Record<ColorComponent, { id: string } | undefined>> | undefined,
  palette: readonly ColorOption[],
): Record<ColorComponent, ColorOption> {
  return Object.fromEntries(
    COLOR_COMPONENTS.map((component) => {
      const id = choices?.[component]?.id;
      const match = palette.find((o) => o.component === component && o.id === id);
      return [component, match ?? defaultOption(palette, component)];
    }),
  ) as Record<ColorComponent, ColorOption>;
}

export function resolveColors(
  choices: Partial<Record<ColorComponent, { id: string } | undefined>> | undefined,
  palette: readonly ColorOption[],
): HallColors {
  const options = resolveColorOptions(choices, palette);
  return Object.fromEntries(COLOR_COMPONENTS.map((c) => [c, toChoice(options[c])])) as HallColors;
}

/** Surcharge rate (per unit) of each chosen colour. */
export function surchargeRates(
  choices: Partial<Record<ColorComponent, { id: string } | undefined>> | undefined,
  palette: readonly ColorOption[],
): Record<ColorComponent, number> {
  const options = resolveColorOptions(choices, palette);
  return Object.fromEntries(COLOR_COMPONENTS.map((c) => [c, options[c].surcharge])) as Record<ColorComponent, number>;
}

export function colorHexes(colors: HallColors): HallColorHexes {
  return Object.fromEntries(COLOR_COMPONENTS.map((c) => [c, colors[c].hex])) as HallColorHexes;
}

export const DEFAULT_COLOR_HEXES: HallColorHexes = colorHexes(defaultColors());
