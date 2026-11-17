import { NextResponse } from 'next/server';
import { getOrSeedPalette } from '../_lib/prices';

// GET – The colour catalogue, public (the configurator needs it). Auto-seeds the built-in palette.
export async function GET() {
  try {
    return NextResponse.json(await getOrSeedPalette());
  } catch (error) {
    console.error('Failed to fetch colours:', error);
    return NextResponse.json({ error: 'Failed to fetch colours' }, { status: 500 });
  }
}
