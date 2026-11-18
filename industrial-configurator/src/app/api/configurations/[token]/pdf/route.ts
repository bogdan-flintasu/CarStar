import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, pdfLimiter } from '@/lib/auth/rateLimit';
import { CONFIGURATION_TOKEN_PATTERN } from '@/lib/validation/configuration';
import { normalizeOrigin } from '@/lib/validation/email';
import { buildQuotePdfForToken } from '../../../_lib/quoteForToken';

// GET – The PDF quote of a saved configuration (public, like the configuration itself).
// Built on every request from the stored configuration and the current prices, so it is never cached.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!CONFIGURATION_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
  }

  // Building a PDF costs CPU: limit it per client.
  const limit = pdfLimiter.check(`pdf:${getClientIp(req.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const origin = normalizeOrigin(process.env.APP_BASE_URL) ?? req.nextUrl.origin;
    const quote = await buildQuotePdfForToken(token, origin);
    if (!quote) return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(quote.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${quote.filename}"`,
        'Content-Length': String(quote.pdf.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Failed to build the PDF quote:', error);
    return NextResponse.json({ error: 'Failed to build the PDF' }, { status: 500 });
  }
}
