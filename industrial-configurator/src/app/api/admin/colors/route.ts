import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/body';
import { colorPaletteSchema } from '@/lib/validation/colors';
import { getOrSeedPalette } from '../../_lib/prices';

// GET – The colour catalogue (admin only; the public read is GET /api/colors).
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getOrSeedPalette(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to fetch colours:', error);
    return NextResponse.json({ error: 'Failed to fetch colours' }, { status: 500 });
  }
}

// PUT – Replace the whole catalogue (admin only). See colorPaletteSchema for the rules.
export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const parsed = await parseJsonBody(req, colorPaletteSchema, 64 * 1024);
  if (!parsed.ok) return parsed.response;

  try {
    await prisma.$transaction([prisma.colorOption.deleteMany(), prisma.colorOption.createMany({ data: parsed.data })]);
    return NextResponse.json(await getOrSeedPalette());
  } catch (error) {
    console.error('Failed to update colours:', error);
    return NextResponse.json({ error: 'Failed to update colours' }, { status: 500 });
  }
}
