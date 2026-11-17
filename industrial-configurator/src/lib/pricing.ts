// Pure pricing module, shared by the client store and (B5) the server.
// Single source of truth for DEFAULT_PRICES.

import type { ColorComponent } from './colors';
import { ROOF_PITCH_DEG } from './hall/constants';
import type { RoofType } from './hall/types';

export const DEFAULT_PRICES = {
  structurePerM3: 45, // €/m³
  foundationPerM2: 35, // €/m²
  sandwichPerM2: 25, // €/m²
  windowPerUnit: 150, // €/buc
  doorPerUnit: 300, // €/buc
  bigDoorPerUnit: 800, // €/buc
};

export type Prices = typeof DEFAULT_PRICES;

export interface PriceParams {
  length: number;
  width: number;
  height: number;
  showFoundation: boolean;
  hasSandwichPanels: boolean;
  /** Default `gable`. */
  roofType?: RoofType;
}

const PITCH = (ROOF_PITCH_DEG * Math.PI) / 180;

/**
 * Cladded wall area, as priced: four rectangles up to the eave (the gable triangles are not counted). On a mono-pitch
 * roof the high side wall is taller by the roof's rise, width * tan(pitch).
 */
export function wallArea({ length, width, height, roofType }: Pick<PriceParams, 'length' | 'width' | 'height' | 'roofType'>): number {
  const rise = roofType === 'mono' ? width * Math.tan(PITCH) : 0;
  return 2 * (length * height) + length * rise + 2 * (width * height);
}

export interface OpeningCounts {
  windows: number;
  doors: number;
  garageDoors: number;
}

export type OpeningsInput = OpeningCounts | ReadonlyArray<{ type: string }>;

export function countOpenings(openings: OpeningsInput): OpeningCounts {
  if (!Array.isArray(openings)) return openings as OpeningCounts;
  const list = openings as ReadonlyArray<{ type: string }>;
  return {
    windows: list.filter((o) => o.type === 'window').length,
    doors: list.filter((o) => o.type === 'door').length,
    garageDoors: list.filter((o) => o.type === 'garageDoor').length,
  };
}

/** Surcharge rate of the chosen colour of each component (see `surchargeRates` in colors.ts). */
export type ColorRates = Record<ColorComponent, number>;

/**
 * What each component's colour surcharge is multiplied by (the units in `SURCHARGE_UNITS`):
 * wall area (as for sandwich panels), roof area along the slope, floor area, metres of gutters plus ridge or high edge,
 * number of doors (personnel and industrial), number of windows.
 */
export function colorQuantities(
  params: Pick<PriceParams, 'length' | 'width' | 'height' | 'roofType'>,
  c: OpeningCounts,
): Record<ColorComponent, number> {
  const { length, width } = params;
  return {
    walls: wallArea(params),
    roof: (length * width) / Math.cos(PITCH),
    steel: length * width,
    // Gable: two eave gutters and the ridge. Mono: one gutter and the high-edge flashing.
    trims: (params.roofType === 'mono' ? 2 : 3) * length,
    doors: c.doors + c.garageDoors,
    windows: c.windows,
  };
}

/**
 * Estimated price in EUR (rounded). Current formula (unchanged from the store):
 * volume * structurePerM3 + openings + foundation (floor area) + sandwich panels (wall area only)
 * + colour surcharges (`colorRates`, per `colorQuantities`).
 * Open business questions: see docs/agents/ws-f.md.
 */
export function calculatePrice(
  params: PriceParams,
  openings: OpeningsInput,
  prices: Prices = DEFAULT_PRICES,
  colorRates?: ColorRates,
): number {
  const { length, width, height, showFoundation, hasSandwichPanels } = params;
  const c = countOpenings(openings);

  let price = length * width * height * prices.structurePerM3;
  price += c.windows * prices.windowPerUnit;
  price += c.doors * prices.doorPerUnit;
  price += c.garageDoors * prices.bigDoorPerUnit;
  if (showFoundation) price += length * width * prices.foundationPerM2;
  if (hasSandwichPanels) {
    price += wallArea(params) * prices.sandwichPerM2;
  }
  if (colorRates) {
    const quantities = colorQuantities(params, c);
    for (const [component, rate] of Object.entries(colorRates) as [ColorComponent, number][]) {
      price += rate * quantities[component];
    }
  }
  return Math.round(price);
}
