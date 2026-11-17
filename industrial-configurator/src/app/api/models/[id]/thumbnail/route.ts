import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth/guard';
import { MODEL_ID_PATTERN } from '@/lib/validation/models';
import { decodeThumbnail } from '../../../_lib/models';

// GET – The screenshot of a model. Public for published models, admin-only otherwise.
// URLs carry `?v=<updatedAt>`, so a response can be cached for good.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!MODEL_ID_PATTERN.test(id)) return notFound();

  try {
    const model = await prisma.hallModel.findUnique({ where: { id }, select: { thumbnail: true, published: true } });
    if (!model || (!model.published && !getAdminSession(req))) return notFound();
    const image = decodeThumbnail(model.thumbnail);
    if (!image) return notFound();
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.type,
        'Cache-Control': model.published ? 'public, max-age=31536000, immutable' : 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Failed to fetch model thumbnail:', error);
    return NextResponse.json({ error: 'Failed to fetch thumbnail' }, { status: 500 });
  }
}
