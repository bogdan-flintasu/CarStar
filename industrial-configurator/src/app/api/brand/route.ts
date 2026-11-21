import { NextResponse } from 'next/server';
import { brandLogoUrl, getActiveBranding } from '@/lib/branding';
import { getUiTheme } from '../_lib/settings';

// GET – What public pages show of the brand (public): company name, logo URL, the interface accent colours and the
// company's public contact (phone, email: printed on every PDF quote anyway), for the AR page's "Cere oferta".
export async function GET() {
  const [branding, theme] = await Promise.all([getActiveBranding(), getUiTheme()]);
  return NextResponse.json(
    {
      name: branding.name,
      logoUrl: brandLogoUrl(branding),
      accent: theme.accent,
      accentText: theme.accentText,
      phone: branding.phone,
      email: branding.email,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
