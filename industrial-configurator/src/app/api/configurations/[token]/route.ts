import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CONFIGURATION_TOKEN_PATTERN } from '@/lib/validation/configuration';
import { listRenders, renderUrl } from '../../_lib/renderStore';

// GET – Fetch a configuration by its share token (public), with the URLs of its quote pictures and PDF.
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
      select: { id: true, token: true, data: true, createdAt: true },
    });

    if (!configuration) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    const { id, ...shown } = configuration;
    const renders = (await listRenders(id)).map((r) => ({ ...r, url: renderUrl(token, r.view) }));
    return NextResponse.json({ ...shown, renders, pdfUrl: `/api/configurations/${token}/pdf` });
  } catch (error) {
    console.error('Failed to fetch configuration:', error);
    return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
  }
}
