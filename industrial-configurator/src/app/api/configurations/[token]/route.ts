import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CONFIGURATION_TOKEN_PATTERN } from '@/lib/validation/configuration';

// GET – Fetch a configuration by its share token (public).
// Contact details (name, email, phone) are never returned here: anyone holding
// the link can call this. Admins see them via GET /api/admin/configurations.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!CONFIGURATION_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
  }

  try {
    const configuration = await prisma.configuration.findUnique({
      where: { token },
      select: { token: true, data: true, createdAt: true },
    });

    if (!configuration) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    return NextResponse.json(configuration);
  } catch (error) {
    console.error('Failed to fetch configuration:', error);
    return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
  }
}
