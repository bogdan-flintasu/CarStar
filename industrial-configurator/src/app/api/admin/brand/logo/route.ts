import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/auth/guard';
import { badRequest, readBodyLimited } from '@/lib/validation/body';
import { checkLogoUpload, MAX_LOGO_BYTES, svgSize } from '@/lib/validation/brand';
import { saveAsset } from '../../../_lib/assetStore';
import { getBrandSettings, setBrandLogo } from '../../../_lib/settings';

const NO_STORE = { 'Cache-Control': 'no-store' };
/** Pictures larger than this are refused: they would be heavy for every quote PDF. */
const MAX_LOGO_SIDE = 6000;

// POST – Upload the logo (admin only). The body is the raw file (PNG, JPG or SVG, at most 1 MB); its type is decided
// by its first bytes, SVG is sanitized, and the picture must decode. Replaces the current logo.
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await readBodyLimited(req, MAX_LOGO_BYTES + 1024);
  if (!body.ok) return badRequest('Logoul poate avea cel mult 1 MB.', 413);

  const check = checkLogoUpload(body.data);
  if (!check.ok) return badRequest(check.error);

  let width: number | null = null;
  let height: number | null = null;
  try {
    if (check.mime === 'image/svg+xml') {
      const size = svgSize(new TextDecoder().decode(check.bytes));
      width = size?.width ?? null;
      height = size?.height ?? null;
      // It must also render, or the PDF quote could not use it.
      await sharp(Buffer.from(check.bytes)).metadata();
    } else {
      const meta = await sharp(Buffer.from(check.bytes)).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      if (!width || !height || width > MAX_LOGO_SIDE || height > MAX_LOGO_SIDE) {
        return badRequest(`Imaginea nu poate depăși ${MAX_LOGO_SIDE} × ${MAX_LOGO_SIDE} px.`);
      }
    }
  } catch {
    return badRequest('Imaginea nu poate fi citită. Încearcă alt fișier.');
  }

  try {
    const asset = await saveAsset({ kind: 'logo', mime: check.mime, bytes: check.bytes, width, height });
    return NextResponse.json(await setBrandLogo(asset.id), { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error('Failed to save the logo:', error);
    return NextResponse.json({ error: 'Failed to save the logo' }, { status: 500 });
  }
}

// DELETE – Remove the logo (admin only); quotes already saved keep theirs.
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    await setBrandLogo(null);
    return NextResponse.json(await getBrandSettings(), { headers: NO_STORE });
  } catch (error) {
    console.error('Failed to remove the logo:', error);
    return NextResponse.json({ error: 'Failed to remove the logo' }, { status: 500 });
  }
}
