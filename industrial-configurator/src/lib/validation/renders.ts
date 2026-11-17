/**
 * Validation of the quote pictures uploaded with a configuration. Nothing the client declares is trusted: the type is
 * read from the magic bytes and the size from the JPEG's own frame header.
 */
import { RENDER_VIEWS, type RenderView } from '@/lib/hall/renderViews';

export const MAX_RENDER_COUNT = RENDER_VIEWS.length;
/** Per picture. The client aims for 350 KB; this leaves room for busy scenes. */
export const MAX_RENDER_BYTES = 600 * 1024;
export const RENDER_DIMENSION_LIMITS = { minWidth: 640, maxWidth: 2048, minHeight: 400, maxHeight: 1280 } as const;
/** Pictures are 16:10. */
export const RENDER_ASPECT = 16 / 10;
const ASPECT_TOLERANCE = 0.02;

/** Form field name of the picture of a view in the multipart upload: `render-front`, `render-rear`, ... */
export const RENDER_FIELD_PREFIX = 'render-';
export const renderField = (view: RenderView) => `${RENDER_FIELD_PREFIX}${view}`;

export interface ValidRender {
  view: RenderView;
  mime: 'image/jpeg';
  bytes: Uint8Array;
  width: number;
  height: number;
}

export type RenderCheck = { ok: true; render: ValidRender } | { ok: false; error: string };

export function isRenderView(value: string): value is RenderView {
  return (RENDER_VIEWS as readonly string[]).includes(value);
}

/**
 * Width and height of a baseline or progressive JPEG, read from its SOF segment; null when the bytes are not a
 * well-formed JPEG (missing SOI/EOI, truncated segment, no frame header).
 */
export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // Fill bytes and stand-alone markers carry no length.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan data before any frame header
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2 || at + 2 + length > bytes.length) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (length < 7) return null;
      const height = (bytes[at + 5] << 8) | bytes[at + 6];
      const width = (bytes[at + 7] << 8) | bytes[at + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    at += 2 + length;
  }
  return null;
}

/** One uploaded picture: a known view, a real JPEG, within the size and dimension limits, 16:10. */
export function validateRender(view: string, bytes: Uint8Array): RenderCheck {
  if (!isRenderView(view)) return { ok: false, error: `Unknown view "${view.slice(0, 40)}"` };
  if (bytes.length === 0) return { ok: false, error: `${view}: empty file` };
  if (bytes.length > MAX_RENDER_BYTES) return { ok: false, error: `${view}: file too large` };
  const size = readJpegSize(bytes);
  if (!size) return { ok: false, error: `${view}: not a JPEG image` };
  const { width, height } = size;
  const L = RENDER_DIMENSION_LIMITS;
  if (width < L.minWidth || width > L.maxWidth || height < L.minHeight || height > L.maxHeight) {
    return { ok: false, error: `${view}: unexpected size ${width}x${height}` };
  }
  if (Math.abs(width / height - RENDER_ASPECT) > ASPECT_TOLERANCE * RENDER_ASPECT) {
    return { ok: false, error: `${view}: not 16:10` };
  }
  return { ok: true, render: { view, mime: 'image/jpeg', bytes, width, height } };
}

/**
 * Every picture of one upload. Fails on the first bad one: a client that sends one invalid picture is not ours.
 * Duplicate views and more than `MAX_RENDER_COUNT` pictures are rejected.
 */
export function validateRenders(
  files: readonly { view: string; bytes: Uint8Array }[],
): { ok: true; renders: ValidRender[] } | { ok: false; error: string } {
  if (files.length > MAX_RENDER_COUNT) return { ok: false, error: 'Too many images' };
  const seen = new Set<string>();
  const renders: ValidRender[] = [];
  for (const file of files) {
    if (seen.has(file.view)) return { ok: false, error: `Duplicate view "${file.view.slice(0, 40)}"` };
    seen.add(file.view);
    const check = validateRender(file.view, file.bytes);
    if (!check.ok) return check;
    renders.push(check.render);
  }
  return { ok: true, renders };
}
