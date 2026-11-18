import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CONFIGURATION_TOKEN_PATTERN } from '@/lib/validation/configuration';
import { isRenderView } from '@/lib/validation/renders';
import { loadRender } from '../../../../_lib/renderStore';

// GET – One quote picture of a saved configuration (public, like the configuration itself).
// Pictures never change once saved: the response is cached for good.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; view: string }> }) {
  const { token, view } = await params;
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!CONFIGURATION_TOKEN_PATTERN.test(token) || !isRenderView(view)) return notFound();

  try {
    const configuration = await prisma.configuration.findUnique({ where: { token }, select: { id: true } });
    const image = configuration && (await loadRender(configuration.id, view));
    if (!image) return notFound();
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        // Always image/jpeg: the bytes were checked on upload, whatever the client declared.
        'Content-Type': 'image/jpeg',
        'Content-Length': String(image.bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Failed to fetch configuration image:', error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
