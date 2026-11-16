import { NextResponse } from 'next/server';
import { getCurrentPrices } from '../_lib/prices';

// GET – Current prices, public (the configurator needs them). Auto-seeds defaults.
export async function GET() {
  try {
    return NextResponse.json(await getCurrentPrices());
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}

// PUT – Kept for backwards compatibility; same handler as PUT /api/admin/prices
// (requires an admin session, validates the body).
export { PUT } from '../admin/prices/route';
