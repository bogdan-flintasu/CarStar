import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/guard';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

/**
 * GET – Paginated list of saved configurations, newest first (admin only).
 * Query: `take` (1–100, default 25), `cursor` (the `nextCursor` of the previous page).
 * Response: `{ items: Configuration[], nextCursor: string | null }`.
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const parsed = querySchema.safeParse({
    take: req.nextUrl.searchParams.get('take') ?? undefined,
    cursor: req.nextUrl.searchParams.get('cursor') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
  }
  const { take, cursor } = parsed.data;

  try {
    const rows = await prisma.configuration.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return NextResponse.json(
      { items, nextCursor: hasMore ? items[items.length - 1].id : null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Failed to fetch configurations:', error);
    return NextResponse.json({ error: 'Failed to fetch configurations' }, { status: 500 });
  }
}
