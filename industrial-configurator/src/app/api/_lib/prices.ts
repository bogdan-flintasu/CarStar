import prisma from '@/lib/prisma';
import { DEFAULT_PRICES, type Prices } from '@/lib/pricing';
import { pickPrices } from './serverPrice';

/** Current price row, seeding the defaults when the table is empty. */
export async function getOrSeedPrices() {
  return (await prisma.prices.findFirst()) ?? prisma.prices.create({ data: DEFAULT_PRICES });
}

/** Current unit prices from the DB (seeded with the defaults on first use). */
export async function getCurrentPrices(): Promise<Prices> {
  return pickPrices(await getOrSeedPrices());
}
