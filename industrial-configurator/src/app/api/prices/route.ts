import { NextResponse } from 'next/server';
import { getOrSeedPrices } from '../_lib/prices';

// GET – Current prices, public (the configurator needs them). Auto-seeds defaults.
export async function GET() {
  try {
    const { structurePerM3, foundationPerM2, sandwichPerM2, windowPerUnit, doorPerUnit, bigDoorPerUnit } =
      await getOrSeedPrices();
    return NextResponse.json({
      structurePerM3,
      foundationPerM2,
      sandwichPerM2,
      windowPerUnit,
      doorPerUnit,
      bigDoorPerUnit,
    });
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}

// PUT – Kept for backwards compatibility; same handler as PUT /api/admin/prices
// (requires an admin session, validates the body).
export { PUT } from '../admin/prices/route';
