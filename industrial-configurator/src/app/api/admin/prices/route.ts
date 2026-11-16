import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/body';
import { pricesSchema } from '@/lib/validation/prices';
import { getOrSeedPrices } from '../../_lib/prices';

// GET – Current prices (admin only; the public read is GET /api/prices).
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getOrSeedPrices(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}

// PUT – Replace the price table (admin only). Every field: finite number, 0 ≤ x ≤ 1e6.
export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const parsed = await parseJsonBody(req, pricesSchema, 4 * 1024);
  if (!parsed.ok) return parsed.response;

  try {
    const existing = await prisma.prices.findFirst();
    const prices = existing
      ? await prisma.prices.update({ where: { id: existing.id }, data: parsed.data })
      : await prisma.prices.create({ data: parsed.data });
    return NextResponse.json(prices);
  } catch (error) {
    console.error('Failed to update prices:', error);
    return NextResponse.json({ error: 'Failed to update prices' }, { status: 500 });
  }
}
