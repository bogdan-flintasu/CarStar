import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET – Fetch a configuration by token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const configuration = await prisma.configuration.findUnique({
      where: { token },
    });

    if (!configuration) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(configuration);
  } catch (error) {
    console.error('Failed to fetch configuration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configuration' },
      { status: 500 }
    );
  }
}
