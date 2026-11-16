import { z } from 'zod';
import type { Prices } from '@/lib/pricing';

/** Upper bound per price field, to catch typos like an extra zero or two. */
export const MAX_UNIT_PRICE = 1_000_000;

const price = z.number().finite().nonnegative().max(MAX_UNIT_PRICE);

/**
 * Body of `PUT /api/admin/prices`. Every field is required; extra keys are rejected.
 * Default values live in `DEFAULT_PRICES` from `@/lib/pricing`.
 */
export const pricesSchema = z.strictObject({
  structurePerM3: price,
  foundationPerM2: price,
  sandwichPerM2: price,
  windowPerUnit: price,
  doorPerUnit: price,
  bigDoorPerUnit: price,
});

export type PriceTable = z.infer<typeof pricesSchema>;

// Compile-time check: the schema covers exactly the fields of the pricing module.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _schemaMatchesPrices: Exact<PriceTable, Prices> = true;
void _schemaMatchesPrices;
