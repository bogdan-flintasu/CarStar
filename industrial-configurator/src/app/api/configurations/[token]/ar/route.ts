import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { arUploadLimiter, getClientIp } from '@/lib/auth/rateLimit';
import { badRequest, readBodyLimited } from '@/lib/validation/body';
import { CONFIGURATION_TOKEN_PATTERN } from '@/lib/validation/configuration';
import { AR_FORMATS, MAX_AR_BYTES, validateArFiles } from '@/lib/validation/arModels';
import { arFileUrl, saveArFiles } from '../../../_lib/arStore';

/** Both files at their limit, plus the multipart boundaries and headers. */
const MAX_AR_UPLOAD_BYTES = MAX_AR_BYTES.glb + MAX_AR_BYTES.usdz + 16 * 1024;
/**
 * The AR files are exported in the browser right after the configuration is saved: later uploads are refused, so an
 * old link (or one passed around) cannot be given a different model.
 */
const AR_UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

// POST – The AR files of a saved configuration (public, like saving it): multipart/form-data with one `glb` and one
// `usdz` file. Accepted once per configuration, within AR_UPLOAD_WINDOW_MS of saving it: 409 when it already has
// them, 410 when the window has closed (distinct, so a client never takes a closed window for files that exist).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!CONFIGURATION_TOKEN_PATTERN.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const limit = arUploadLimiter.check(`ar:${getClientIp(req.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    return badRequest('Expected multipart/form-data', 415);
  }

  try {
    const configuration = await prisma.configuration.findUnique({ where: { token }, select: { id: true, createdAt: true } });
    if (!configuration) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (Date.now() - configuration.createdAt.getTime() > AR_UPLOAD_WINDOW_MS) {
      return NextResponse.json({ error: 'Upload window closed' }, { status: 410 });
    }

    const body = await readBodyLimited(req, MAX_AR_UPLOAD_BYTES);
    if (!body.ok) return body.response;
    let form: FormData;
    try {
      const contentType = req.headers.get('content-type') ?? '';
      form = await new Response(new Uint8Array(body.data), { headers: { 'content-type': contentType } }).formData();
    } catch {
      return badRequest('Invalid multipart body');
    }

    const files: { format: string; bytes: Uint8Array }[] = [];
    for (const [name, value] of form.entries()) {
      if (typeof value === 'string' || files.length >= AR_FORMATS.length) return badRequest('Unexpected form field');
      files.push({ format: name, bytes: new Uint8Array(await value.arrayBuffer()) });
    }
    const checked = validateArFiles(files);
    if (!checked.ok) return badRequest('Invalid AR file', 400, checked.error);

    if (!(await saveArFiles(configuration.id, checked.files))) {
      return NextResponse.json({ error: 'AR files already saved' }, { status: 409 });
    }
    return NextResponse.json({ glb: arFileUrl(token, 'glb'), usdz: arFileUrl(token, 'usdz') }, { status: 201 });
  } catch (error) {
    console.error('Failed to save the AR files:', error);
    return NextResponse.json({ error: 'Failed to save the AR files' }, { status: 500 });
  }
}
