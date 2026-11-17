import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/body';
import { hallModelPatchSchema, MODEL_ID_PATTERN } from '@/lib/validation/models';
import { MAX_MODEL_BODY_BYTES, MODEL_LIST_SELECT, toAdminModel } from '../../../_lib/models';

type Context = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

// PATCH – Update any of name, description, data, thumbnail, published, sortOrder (admin only).
export async function PATCH(req: NextRequest, { params }: Context) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!MODEL_ID_PATTERN.test(id)) return notFound();

  const parsed = await parseJsonBody(req, hallModelPatchSchema, MAX_MODEL_BODY_BYTES);
  if (!parsed.ok) return parsed.response;

  try {
    if (!(await prisma.hallModel.findUnique({ where: { id }, select: { id: true } }))) return notFound();
    const row = await prisma.hallModel.update({ where: { id }, data: parsed.data, select: { ...MODEL_LIST_SELECT, thumbnail: true } });
    const { thumbnail, ...rest } = row;
    return NextResponse.json(toAdminModel({ ...rest, hasThumbnail: thumbnail !== '' }));
  } catch (error) {
    console.error('Failed to update model:', error);
    return NextResponse.json({ error: 'Failed to update model' }, { status: 500 });
  }
}

// DELETE – Remove a model (admin only). Saved customer configurations keep their own copy of the hall.
export async function DELETE(req: NextRequest, { params }: Context) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!MODEL_ID_PATTERN.test(id)) return notFound();
  try {
    const { count } = await prisma.hallModel.deleteMany({ where: { id } });
    return count ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (error) {
    console.error('Failed to delete model:', error);
    return NextResponse.json({ error: 'Failed to delete model' }, { status: 500 });
  }
}
