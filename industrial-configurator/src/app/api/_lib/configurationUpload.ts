/**
 * Body of `POST /api/configurations` with pictures: multipart/form-data with a `payload` field (the same JSON as the
 * plain JSON body) and up to one `render-<view>` JPEG per view. The whole body is read with a hard cap first, so an
 * oversized upload is cut off before it is parsed.
 */
import { badRequest, parseJsonText, readBodyLimited, type ParseResult } from '@/lib/validation/body';
import { createConfigurationSchema, type CreateConfigurationInput } from '@/lib/validation/configuration';
import {
  MAX_RENDER_BYTES,
  MAX_RENDER_COUNT,
  RENDER_FIELD_PREFIX,
  validateRenders,
  type ValidRender,
} from '@/lib/validation/renders';

/** JSON part, as for a plain JSON body. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Every picture at its limit, the payload, and the multipart boundaries and headers. */
export const MAX_UPLOAD_BYTES = MAX_PAYLOAD_BYTES + MAX_RENDER_COUNT * MAX_RENDER_BYTES + 16 * 1024;
export const PAYLOAD_FIELD = 'payload';

export const isMultipart = (req: Request) =>
  (req.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data');

export async function parseConfigurationUpload(
  req: Request,
): Promise<ParseResult<{ input: CreateConfigurationInput; renders: ValidRender[] }>> {
  const body = await readBodyLimited(req, MAX_UPLOAD_BYTES);
  if (!body.ok) return body;

  let form: FormData;
  try {
    const contentType = req.headers.get('content-type') ?? '';
    form = await new Response(new Uint8Array(body.data), { headers: { 'content-type': contentType } }).formData();
  } catch {
    return { ok: false, response: badRequest('Invalid multipart body') };
  }

  let payload: string | null = null;
  const files: { view: string; bytes: Uint8Array }[] = [];
  for (const [name, value] of form.entries()) {
    if (name === PAYLOAD_FIELD && typeof value === 'string' && payload === null) {
      payload = value;
    } else if (name.startsWith(RENDER_FIELD_PREFIX) && typeof value !== 'string') {
      if (files.length >= MAX_RENDER_COUNT) return { ok: false, response: badRequest('Too many images') };
      files.push({ view: name.slice(RENDER_FIELD_PREFIX.length), bytes: new Uint8Array(await value.arrayBuffer()) });
    } else {
      return { ok: false, response: badRequest('Unexpected form field') };
    }
  }
  if (payload === null || payload.length > MAX_PAYLOAD_BYTES) return { ok: false, response: badRequest('Invalid payload') };

  const input = parseJsonText(payload, createConfigurationSchema);
  if (!input.ok) return input;
  const renders = validateRenders(files);
  if (!renders.ok) return { ok: false, response: badRequest('Invalid image', 400, renders.error) };
  return { ok: true, data: { input: input.data, renders: renders.renders } };
}
