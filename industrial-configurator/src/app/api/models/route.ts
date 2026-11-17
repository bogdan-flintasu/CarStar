import { NextResponse } from 'next/server';
import { listModels, toSummary } from '../_lib/models';

// GET – Published predefined halls, in display order (public: the configurator lists them).
export async function GET() {
  try {
    return NextResponse.json((await listModels(true)).map(toSummary));
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
  }
}
