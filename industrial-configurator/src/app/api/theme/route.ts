import { NextResponse } from 'next/server';
import { getUiTheme } from '../_lib/settings';

// GET – The configurator's interface theme, public (the configurator and embeds need it).
export async function GET() {
  return NextResponse.json(await getUiTheme(), { headers: { 'Cache-Control': 'no-store' } });
}
