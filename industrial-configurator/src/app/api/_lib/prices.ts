import prisma from '@/lib/prisma';
import { DEFAULT_PRICES } from '@/lib/pricing';

/** Current price row, seeding the defaults when the table is empty. */
export async function getOrSeedPrices() {
  return (await prisma.prices.findFirst()) ?? prisma.prices.create({ data: DEFAULT_PRICES });
}
