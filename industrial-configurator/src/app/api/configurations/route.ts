import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { nanoid } from 'nanoid';

// POST – Create a new configuration
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, userName, userEmail, userPhone } = body;

    const token = nanoid(12);

    const configuration = await prisma.configuration.create({
      data: {
        token,
        data: data ?? {},
        userName: userName ?? null,
        userEmail: userEmail ?? null,
        userPhone: userPhone ?? null,
      },
    });

    return NextResponse.json({ token: configuration.token }, { status: 201 });
  } catch (error) {
    console.error('Failed to create configuration:', error);
    return NextResponse.json(
      { error: 'Failed to create configuration' },
      { status: 500 }
    );
  }
}

// GET – List all configurations (for admin dashboard)
export async function GET() {
  try {
    const configurations = await prisma.configuration.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(configurations);
  } catch (error) {
    console.error('Failed to fetch configurations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configurations' },
      { status: 500 }
    );
  }
}
