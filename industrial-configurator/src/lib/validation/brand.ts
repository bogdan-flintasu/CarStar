/**
 * Validation of brand data: the logo file (type by magic bytes, SVG sanitizer), the brand form and the branding
 * snapshot frozen into each saved quote. Pure (no I/O), so it is unit-tested directly.
 */
import { z } from 'zod';
import { HEX_PATTERN } from '@/lib/colors';

// ─── Logo file ───────────────────────────────────────────────────────────────

export const MAX_LOGO_BYTES = 1024 * 1024;
export const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
export type LogoMime = (typeof LOGO_MIMES)[number];

/** The real type of an uploaded file from its first bytes (never the extension or the client's MIME), or null. */
export function sniffLogoMime(bytes: Uint8Array): LogoMime | null {
  const starts = (sig: number[]) => bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  // SVG is text: after an optional BOM, XML declaration, comments and doctype the root element must be <svg.
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 4096)).replace(/^﻿/, '');
  if (/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>[]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) {
    return 'image/svg+xml';
  }
  return null;
}

export type LogoCheck = { ok: true; mime: LogoMime; bytes: Uint8Array } | { ok: false; error: string };

/**
 * Checks an uploaded logo: size, real type, and for SVG the sanitized markup (which replaces the upload).
 * Messages are Romanian: they are shown to the admin.
 */
export function checkLogoUpload(bytes: Uint8Array): LogoCheck {
  if (bytes.byteLength === 0) return { ok: false, error: 'Fișierul este gol.' };
  if (bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, error: 'Logoul poate avea cel mult 1 MB.' };
  const mime = sniffLogoMime(bytes);
  if (!mime) return { ok: false, error: 'Sunt acceptate doar fișiere PNG, JPG sau SVG.' };
  if (mime !== 'image/svg+xml') return { ok: true, mime, bytes };
  const clean = sanitizeSvg(new TextDecoder('utf-8').decode(bytes));
  if (!clean) return { ok: false, error: 'Fișierul SVG nu este valid sau nu conține nimic de afișat.' };
  return { ok: true, mime, bytes: new TextEncoder().encode(clean) };
}

// ─── SVG sanitizer ───────────────────────────────────────────────────────────
// Allow-list based: every element and attribute that is not known to be harmless is dropped, scripts and
// foreignObject with their whole subtree. Output is rebuilt from tokens, never passed through.

const SVG_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'title', 'desc', 'image', 'style',
]);
/** Dropped together with everything inside them. Anything not in SVG_ELEMENTS or here is dropped the same way. */
const UNWRAP_ELEMENTS = new Set(['a']);

const SVG_ATTRIBUTES = new Set([
  'id', 'class', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'dx', 'dy',
  'd', 'points', 'transform', 'gradienttransform', 'gradientunits', 'patterntransform', 'patternunits', 'patterncontentunits',
  'offset', 'spreadmethod', 'clippathunits', 'maskunits', 'maskcontentunits', 'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'stroke-dashoffset', 'opacity', 'stop-color', 'stop-opacity', 'clip-path', 'clip-rule', 'mask', 'style', 'xmlns', 'xmlns:xlink',
  'version', 'preserveaspectratio', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'word-spacing', 'text-decoration', 'xml:space', 'href', 'xlink:href',
  'display', 'visibility', 'color', 'rotate', 'textlength', 'lengthadjust',
]);

const SAFE_ENTITY = /&(?:amp|lt|gt|quot|apos);/g;
/** CSS that could load or run something. `url(#id)` references inside the document are fine. */
const UNSAFE_CSS = /\\|@import|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|url\s*\(\s*(?!['"]?\s*#)/i;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i;

const escapeAttr = (v: string) => v.replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const escapeText = (v: string) => v.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The value to keep for an attribute, or null to drop it. */
function cleanAttribute(element: string, name: string, raw: string): string | null {
  if (!SVG_ATTRIBUTES.has(name)) return null; // also drops every on* handler
  // Only the five basic entities: numeric or named ones could hide "javascript:" from the checks below.
  if (raw.replace(SAFE_ENTITY, '').includes('&')) return null;
  const value = raw.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const flat = value.replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase();
  if (flat.includes('javascript:') || flat.includes('vbscript:')) return null;
  if (name === 'href' || name === 'xlink:href') {
    if (/^#[\w.:-]+$/.test(value.trim())) return value.trim();
    if (element === 'image' && DATA_IMAGE.test(value.trim())) return value.trim();
    return null; // external references are never kept
  }
  if (name === 'style' || /url\s*\(/i.test(value)) return UNSAFE_CSS.test(value) ? null : value;
  return value;
}

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|[^<]+|</g;
const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/**
 * A sanitized copy of an SVG document, or null when nothing usable is left (not an SVG, no root element).
 * Removes scripts, event handlers, `foreignObject`, external `href`s, `<style>` with `url(`, comments, processing
 * instructions, doctype and entities.
 */
export function sanitizeSvg(source: string): string | null {
  const input = source.replace(/^﻿/, '');
  if (/<!ENTITY/i.test(input)) return null; // entity expansion tricks
  const out: string[] = [];
  const open: string[] = []; // kept elements, to close them in order
  let skipping: string | null = null; // a dropped element whose subtree is being skipped
  let skipDepth = 0;
  let rootSeen = false;
  let styleOpen = false;
  let styleText = '';

  for (const match of input.matchAll(TOKEN)) {
    const [token, closing, rawName, rawAttributes, selfClosing] = match;
    if (rawName === undefined) {
      // text, comment, CDATA, doctype, processing instruction
      if (skipping || token.startsWith('<!') || token.startsWith('<?') || token === '<') continue;
      if (styleOpen) styleText += token;
      else if (open.length > 0 && /^[^<]/.test(token)) out.push(escapeText(token));
      continue;
    }
    const name = rawName.toLowerCase();
    if (skipping) {
      if (name === skipping) {
        if (closing) skipDepth--;
        else if (!selfClosing) skipDepth++;
        if (skipDepth === 0) skipping = null;
      }
      continue;
    }
    // Inside <style> everything but its end tag is plain CSS text.
    if (styleOpen && !(closing && name === 'style')) continue;
    if (closing) {
      if (name === 'style' && styleOpen) {
        styleOpen = false;
        if (!UNSAFE_CSS.test(styleText)) out.push(`${styleText.replace(/</g, '')}</style>`); // the opening tag is already in out
        else out.pop(); // the opening tag
        styleText = '';
        open.pop();
        continue;
      }
      if (UNWRAP_ELEMENTS.has(name)) continue;
      if (open[open.length - 1] === name) {
        open.pop();
        out.push(`</${name === 'lineargradient' ? 'linearGradient' : name === 'radialgradient' ? 'radialGradient' : name === 'clippath' ? 'clipPath' : name}>`);
      }
      continue;
    }
    if (UNWRAP_ELEMENTS.has(name)) continue;
    if (!SVG_ELEMENTS.has(name) || (name === 'svg' && rootSeen && open.length === 0)) {
      if (!selfClosing) {
        skipping = name;
        skipDepth = 1;
      }
      continue;
    }
    if (!rootSeen) {
      if (name !== 'svg') return null;
      rootSeen = true;
    }
    const attributes: string[] = [];
    for (const a of rawAttributes.matchAll(ATTRIBUTE)) {
      const attrName = a[1].toLowerCase();
      const value = cleanAttribute(name, attrName, a[2] ?? a[3] ?? a[4] ?? '');
      if (value !== null) attributes.push(` ${a[1]}="${escapeAttr(value)}"`);
    }
    if (name === 'svg' && open.length === 0 && !attributes.some((a) => a.startsWith(' xmlns="'))) {
      attributes.unshift(' xmlns="http://www.w3.org/2000/svg"');
    }
    const outName = name === 'lineargradient' ? 'linearGradient' : name === 'radialgradient' ? 'radialGradient' : name === 'clippath' ? 'clipPath' : name;
    out.push(`<${outName}${attributes.join('')}${selfClosing ? '/' : ''}>`);
    if (!selfClosing) {
      open.push(name);
      if (name === 'style') styleOpen = true;
    } else if (name === 'style') {
      out.pop();
    }
  }
  while (open.length > 0) out.push(`</${open.pop()}>`);
  const svg = out.join('');
  return rootSeen && svg.length > 0 ? svg : null;
}

/** Width and height of an SVG, from its viewBox (preferred) or width/height attributes; null when unknown. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const viewBox = root.match(/viewBox="\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*"/i);
  const num = (attr: string) => Number(root.match(new RegExp(`\\s${attr}="([\\d.]+)(?:px)?"`, 'i'))?.[1]);
  const [width, height] = viewBox ? [Number(viewBox[1]), Number(viewBox[2])] : [num('width'), num('height')];
  return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height) ? { width: Math.round(width), height: Math.round(height) } : null;
}

// ─── Brand form ──────────────────────────────────────────────────────────────

const hex = z.string().regex(HEX_PATTERN).transform((v) => v.toLowerCase());
const line = (max: number) => z.string().max(max).transform((v) => v.replace(/[\r\n\t]+/g, ' ').trim());

/** Body of `PUT /api/admin/brand`: company details and the two brand colours (empty / null: not set). */
export const brandFormSchema = z.strictObject({
  displayName: line(120),
  legalName: line(160),
  taxId: line(40),
  regNo: line(40),
  address: line(200),
  phone: line(60),
  email: z.union([z.literal(''), z.string().max(254).email()]),
  website: line(200),
  primaryColor: z.union([z.literal(''), hex]),
  secondaryColor: z.union([z.literal(''), hex, z.null()]),
});
export type BrandForm = z.infer<typeof brandFormSchema>;

// ─── Branding snapshot (frozen into each saved quote) ───────────────────────

export const brandingSnapshotSchema = z.object({
  v: z.literal(1),
  name: z.string().max(200),
  address: z.string().max(200),
  phone: z.string().max(60),
  email: z.string().max(254),
  website: z.string().max(200),
  colors: z.object({ primary: hex, text: hex, muted: hex, line: hex }),
  logoAssetId: z.string().max(64).nullable(),
  logoSha256: z.string().max(64).nullable(),
  /** BRAND_LOGO file under public/ (when the logo is not an uploaded asset). */
  logoPath: z.string().max(200).nullable().default(null),
});
export type BrandingSnapshot = z.infer<typeof brandingSnapshotSchema>;
