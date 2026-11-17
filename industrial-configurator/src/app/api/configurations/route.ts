import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import prisma from '@/lib/prisma';
import { configurationLimiter, getClientIp } from '@/lib/auth/rateLimit';
import { parseJsonBody } from '@/lib/validation/body';
import { createConfigurationSchema } from '@/lib/validation/configuration';
import { getCurrentPrices, getOrSeedPalette } from '../_lib/prices';
import { withServerPrice } from '../_lib/serverPrice';

/** 200 openings at ~200 bytes each plus the summary stays well below this. */
const MAX_BODY_BYTES = 64 * 1024;

// POST – Create a new configuration (public). Body: { data, userName?, userEmail?, userPhone? }.
export async function POST(req: NextRequest) {
  const limit = configurationLimiter.check(`cfg:${getClientIp(req.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseJsonBody(req, createConfigurationSchema, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const { data, userName, userEmail, userPhone } = parsed.data;

  try {
    // B5: never store the client's price; recompute it from the validated data and DB prices.
    const priced = withServerPrice(data, await getCurrentPrices(), await getOrSeedPalette());
    // The starting model is kept only if it exists, under its current name.
    const model = data.model
      ? await prisma.hallModel.findUnique({ where: { id: data.model.id }, select: { id: true, name: true } })
      : null;
    priced.model = model ?? undefined;
    const configuration = await prisma.configuration.create({
      data: { token: nanoid(12), data: priced, userName, userEmail, userPhone },
    });
    return NextResponse.json({ token: configuration.token }, { status: 201 });
  } catch (error) {
    console.error('Failed to create configuration:', error);
    return NextResponse.json({ error: 'Failed to create configuration' }, { status: 500 });
  }
}

// GET – Kept for backwards compatibility; same handler as GET /api/admin/configurations
// (admin session required, paginated).
export { GET } from '../admin/configurations/route';
