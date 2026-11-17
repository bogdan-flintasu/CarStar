import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/body';
import { hallModelCreateSchema } from '@/lib/validation/models';
import { listModels, MAX_MODEL_BODY_BYTES, MODEL_LIST_SELECT, toAdminModel } from '../../_lib/models';

// GET – Every model, published or not, in display order (admin only).
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await listModels(false), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
  }
}

// POST – Create a model from the configurator (admin only). New models go to the end of the list.
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const parsed = await parseJsonBody(req, hallModelCreateSchema, MAX_MODEL_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const { thumbnail, ...rest } = parsed.data;

  try {
    const last = await prisma.hallModel.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const row = await prisma.hallModel.create({
      data: { ...rest, thumbnail: thumbnail ?? '', sortOrder: (last?.sortOrder ?? -1) + 1 },
      select: MODEL_LIST_SELECT,
    });
    return NextResponse.json(toAdminModel({ ...row, hasThumbnail: Boolean(thumbnail) }), { status: 201 });
  } catch (error) {
    console.error('Failed to create model:', error);
    return NextResponse.json({ error: 'Failed to create model' }, { status: 500 });
  }
}
