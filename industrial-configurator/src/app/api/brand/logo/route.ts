import { NextRequest, NextResponse } from 'next/server';
import { getActiveBranding } from '@/lib/branding';
import { loadAsset } from '../../_lib/assetStore';

// GET – The current logo (public). The ETag is the file's sha256. A request that carries the right `?v=<sha8>` (the URL
// brandLogoUrl() builds) is cached for a year; a new logo has a new version, so it shows immediately. Without it the
// browser revalidates with the ETag. 404 when there is no uploaded logo.
export async function GET(req: NextRequest) {
  try {
    const branding = await getActiveBranding();
    const asset = branding.logoAssetId ? await loadAsset(branding.logoAssetId) : null;
    if (!asset) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-cache' } });

    const etag = `"${asset.sha256}"`;
    const versioned = req.nextUrl.searchParams.get('v') === asset.sha256.slice(0, 8);
    const headers: Record<string, string> = {
      ETag: etag,
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, no-cache',
      'X-Content-Type-Options': 'nosniff',
      // An SVG opened on its own gets no scripts and no sub-resources, whatever it contains.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    };
    if (req.headers.get('if-none-match')?.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(new Uint8Array(asset.bytes), {
      headers: { ...headers, 'Content-Type': asset.mime, 'Content-Length': String(asset.size) },
    });
  } catch (error) {
    console.error('Failed to serve the logo:', error);
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-cache' } });
  }
}
