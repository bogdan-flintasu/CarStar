import { NextRequest, NextResponse } from 'next/server';
import { getActiveBranding } from '@/lib/branding';

// GET – The favicon (public): the uploaded logo when there is one, else the stock /favicon.ico. The page's <link rel="icon">
// points here, so a new logo reaches the tab icon without rebuilding the site.
export async function GET(req: NextRequest) {
  const branding = await getActiveBranding();
  const target = branding.logoAssetId ? `/api/brand/logo?v=${(branding.logoSha256 ?? '').slice(0, 8)}` : '/favicon.ico';
  return NextResponse.redirect(new URL(target, req.url), { status: 307, headers: { 'Cache-Control': 'public, max-age=60' } });
}
