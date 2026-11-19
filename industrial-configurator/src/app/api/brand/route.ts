import { NextResponse } from 'next/server';
import { brandLogoUrl, getActiveBranding } from '@/lib/branding';
import { getUiTheme } from '../_lib/settings';

// GET – What public pages show of the brand (public): company name, logo URL and the interface accent colours.
export async function GET() {
  const [branding, theme] = await Promise.all([getActiveBranding(), getUiTheme()]);
  return NextResponse.json(
    { name: branding.name, logoUrl: brandLogoUrl(branding), accent: theme.accent, accentText: theme.accentText },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
