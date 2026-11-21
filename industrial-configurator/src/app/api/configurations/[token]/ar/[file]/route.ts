import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CONFIGURATION_TOKEN_PATTERN } from '@/lib/validation/configuration';
import { AR_MIME, arFormatOfFile } from '@/lib/validation/arModels';
import { loadArFile } from '../../../../_lib/arStore';

// GET – One AR file of a saved configuration: `hall.glb` or `hall.usdz` (public, like the configuration).
// Scene Viewer fetches the GLB from Google's app, not from our page: CORS is open. The files never change once saved.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await params;
  const format = arFormatOfFile(file);
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!CONFIGURATION_TOKEN_PATTERN.test(token) || !format) return notFound();

  try {
    const configuration = await prisma.configuration.findUnique({ where: { token }, select: { id: true } });
    const bytes = configuration && (await loadArFile(configuration.id, format));
    if (!bytes) return notFound();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': AR_MIME[format],
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Failed to fetch the AR file:', error);
    return NextResponse.json({ error: 'Failed to fetch the AR file' }, { status: 500 });
  }
}
