// Pure pricing module, shared by the client store and (B5) the server.
// Single source of truth for DEFAULT_PRICES.

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

/**
 * Estimated price in EUR (rounded). Current formula (unchanged from the store):
 * volume * structurePerM3 + openings + foundation (floor area) + sandwich panels (wall area only).
 * Open business questions: see docs/agents/ws-f.md.
 */
export function calculatePrice(
  params: PriceParams,
  openings: OpeningsInput,
  prices: Prices = DEFAULT_PRICES,
): number {
  const { length, width, height, showFoundation, hasSandwichPanels } = params;
  const c = countOpenings(openings);

  let price = length * width * height * prices.structurePerM3;
  price += c.windows * prices.windowPerUnit;
  price += c.doors * prices.doorPerUnit;
  price += c.garageDoors * prices.bigDoorPerUnit;
  if (showFoundation) price += length * width * prices.foundationPerM2;
  if (hasSandwichPanels) {
    const wallArea = 2 * (length * height) + 2 * (width * height);
    price += wallArea * prices.sandwichPerM2;
  }
  return Math.round(price);
}
