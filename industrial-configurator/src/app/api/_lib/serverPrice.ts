import {
  calculatePrice,
  countOpenings,
  type OpeningCounts,
  type Prices,
} from '@/lib/pricing';
import { DEFAULT_PALETTE, resolveColors, surchargeRates, type ColorOption } from '@/lib/colors';
import { configurationDataSchema, type ConfigurationData } from '@/lib/validation/configuration';

/** The six unit prices from a DB row (drops `id`, `updatedAt`, ...). */
export function pickPrices(row: Prices): Prices {
  const { structurePerM3, foundationPerM2, sandwichPerM2, windowPerUnit, doorPerUnit, bigDoorPerUnit } =
    row;
  return { structurePerM3, foundationPerM2, sandwichPerM2, windowPerUnit, doorPerUnit, bigDoorPerUnit };
}

/**
 * Opening counts the server trusts. `openingsList` is what a saved
 * configuration actually renders, so when it has items it wins over the
 * client-sent `openings` counts. Without a list (the email summary carries only
 * counts) the validated counts are used.
 */
export function trustedOpeningCounts(data: ConfigurationData): OpeningCounts {
  if (data.openingsList.length > 0) return countOpenings(data.openingsList);
  return data.openings ?? { windows: 0, doors: 0, garageDoors: 0 };
}

/**
 * Returns `data` with every price-related field recomputed on the server from
 * the validated dimensions/options and the given (DB) prices. Client-sent
 * `estimatedPrice`, `floorArea` and `openings` are discarded. Colours are re-resolved against the admin's
 * catalogue (`palette`): unknown ids become the defaults, names and hexes come from the catalogue.
 */
export function withServerPrice(
  data: ConfigurationData,
  prices: Prices,
  palette: readonly ColorOption[] = DEFAULT_PALETTE,
): ConfigurationData {
  const { length, width, height } = data.dimensions;
  const openings = trustedOpeningCounts(data);
  const estimatedPrice = calculatePrice(
    {
      length,
      width,
      height,
      showFoundation: data.foundation,
      hasSandwichPanels: data.sandwichPanels,
    },
    openings,
    prices,
    surchargeRates(data.colors, palette),
  );
  const colors = resolveColors(data.colors, palette);
  return { ...data, colors, openings, floorArea: length * width, estimatedPrice };
}

/**
 * Configuration summary for the lead email, priced on the server.
 * The saved configuration behind a verified link (`stored`, raw JSON from the DB)
 * wins over the client-sent summary; the client summary is used only when there
 * is no link or the stored row does not match the current schema (legacy data).
 */
export function resolveEmailSummary(
  stored: unknown,
  clientSummary: ConfigurationData | null | undefined,
  prices: Prices,
  palette: readonly ColorOption[] = DEFAULT_PALETTE,
): ConfigurationData | null {
  const fromDb = stored === undefined ? null : configurationDataSchema.safeParse(stored);
  const summary = fromDb?.success ? fromDb.data : clientSummary;
  return summary ? withServerPrice(summary, prices, palette) : null;
}
