import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const DEFAULT_PRICES = {
  structurePerM3: 45,
  foundationPerM2: 35,
  sandwichPerM2: 25,
  windowPerUnit: 150,
  doorPerUnit: 300,
  bigDoorPerUnit: 800,
};

// GET – Fetch current prices (auto-seed if empty)
export async function GET() {
  try {
    let prices = await prisma.prices.findFirst();

    if (!prices) {
      // Seed the database with default prices
      prices = await prisma.prices.create({
        data: DEFAULT_PRICES,
      });
    }

    return NextResponse.json(prices);
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}

// PUT – Update prices (admin only)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      structurePerM3,
      foundationPerM2,
      sandwichPerM2,
      windowPerUnit,
      doorPerUnit,
      bigDoorPerUnit,
    } = body;

    // Find existing record or create one
    let prices = await prisma.prices.findFirst();

    if (prices) {
      prices = await prisma.prices.update({
        where: { id: prices.id },
        data: {
          structurePerM3,
          foundationPerM2,
          sandwichPerM2,
          windowPerUnit,
          doorPerUnit,
          bigDoorPerUnit,
        },
      });
    } else {
      prices = await prisma.prices.create({
        data: {
          structurePerM3,
          foundationPerM2,
          sandwichPerM2,
          windowPerUnit,
          doorPerUnit,
          bigDoorPerUnit,
        },
      });
    }

    return NextResponse.json(prices);
  } catch (error) {
    console.error('Failed to update prices:', error);
    return NextResponse.json(
      { error: 'Failed to update prices' },
      { status: 500 }
    );
  }
}
