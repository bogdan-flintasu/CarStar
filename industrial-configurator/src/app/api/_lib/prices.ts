import prisma from '@/lib/prisma';
import { DEFAULT_PRICES, type Prices } from '@/lib/pricing';
import { COLOR_COMPONENTS, DEFAULT_PALETTE, type ColorOption } from '@/lib/colors';
import { pickPrices } from './serverPrice';

/** Current price row, seeding the defaults when the table is empty. */
export async function getOrSeedPrices() {
  return (await prisma.prices.findFirst()) ?? prisma.prices.create({ data: DEFAULT_PRICES });
}

/** Current unit prices from the DB (seeded with the defaults on first use). */
export async function getCurrentPrices(): Promise<Prices> {
  return pickPrices(await getOrSeedPrices());
}

/**
 * The admin's colour catalogue, seeding the built-in one when the table is empty.
 * Rows with an unknown component are dropped (the column is a plain string).
 */
export async function getOrSeedPalette(): Promise<ColorOption[]> {
  if ((await prisma.colorOption.count()) === 0) {
    try {
      await prisma.colorOption.createMany({ data: [...DEFAULT_PALETTE] });
    } catch (error) {
      // Another request seeded it first (same fixed ids): read what it wrote.
      if ((await prisma.colorOption.count()) === 0) throw error;
    }
  }
  const rows = await prisma.colorOption.findMany({ orderBy: [{ component: 'asc' }, { sortOrder: 'asc' }] });
  return rows.filter((row): row is ColorOption => (COLOR_COMPONENTS as readonly string[]).includes(row.component));
}
