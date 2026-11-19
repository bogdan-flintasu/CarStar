import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/body';
import { brandFormSchema } from '@/lib/validation/brand';
import { getBrandSettings, saveBrandForm } from '../../_lib/settings';

const NO_STORE = { 'Cache-Control': 'no-store' };

// GET – Company details, brand colours and the logo URL (admin only).
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getBrandSettings(), { headers: NO_STORE });
  } catch (error) {
    console.error('Failed to read the brand identity:', error);
    return NextResponse.json({ error: 'Failed to read the brand identity' }, { status: 500 });
  }
}

// PUT – Replace the company details and brand colours (admin only). See brandFormSchema. The logo has its own route.
export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const parsed = await parseJsonBody(req, brandFormSchema, 8 * 1024);
  if (!parsed.ok) return parsed.response;

  try {
    return NextResponse.json(await saveBrandForm(parsed.data), { headers: NO_STORE });
  } catch (error) {
    console.error('Failed to save the brand identity:', error);
    return NextResponse.json({ error: 'Failed to save the brand identity' }, { status: 500 });
  }
}
