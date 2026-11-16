import { NextResponse } from 'next/server';
import type { z } from 'zod';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

function badRequest(error: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json(details ? { error, details } : { error }, { status });
}

/**
 * Read a JSON body with a hard byte cap, then validate it with `schema`.
 * Returns 413 when the body is too large and 400 when it is not valid JSON or
 * does not match the schema.
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  maxBytes: number,
): Promise<ParseResult<z.output<S>>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: badRequest('Payload too large', 413) };
  }

  let text: string;
  try {
    text = await readLimited(req, maxBytes);
  } catch {
    return { ok: false, response: badRequest('Payload too large', 413) };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: badRequest('Invalid JSON') };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 20).map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return { ok: false, response: badRequest('Invalid request body', 400, details) };
  }
  return { ok: true, data: parsed.data };
}

/** Read the request body as text, aborting once more than `maxBytes` arrive. */
async function readLimited(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}
