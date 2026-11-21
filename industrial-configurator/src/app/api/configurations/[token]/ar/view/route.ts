import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { arViewLimiter, getClientIp } from '@/lib/auth/rateLimit';
import { CONFIGURATION_TOKEN_PATTERN } from '@/lib/validation/configuration';
import { countArView } from '../../../../_lib/arStore';

// POST – Counts one opening of the AR page (public, no body). A usage signal per configuration (docs/plans/ar.md,
// "Metrics"); rate-limited per client so a reload loop cannot inflate it much.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!CONFIGURATION_TOKEN_PATTERN.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const limit = arViewLimiter.check(`arview:${getClientIp(req.headers)}`);
  // Over the limit the view is simply not counted: the page does not care.
  if (!limit.allowed) return new NextResponse(null, { status: 204 });

  try {
    const configuration = await prisma.configuration.findUnique({ where: { token }, select: { id: true } });
    if (!configuration) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await countArView(configuration.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Failed to count the AR view:', error);
    return NextResponse.json({ error: 'Failed to count the view' }, { status: 500 });
  }
}
