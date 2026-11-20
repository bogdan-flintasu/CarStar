import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { brandFormSchema, brandingSnapshotSchema, checkLogoUpload, MAX_LOGO_BYTES, sanitizeSvg, sniffLogoMime, svgSize } from './brand';

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const GIF = enc('GIF89a....');
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0]); // "MZ"

describe('logo type by magic bytes', () => {
  it('accepts PNG, JPEG and SVG', () => {
    expect(sniffLogoMime(PNG)).toBe('image/png');
    expect(sniffLogoMime(JPEG)).toBe('image/jpeg');
    expect(sniffLogoMime(enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml');
    expect(sniffLogoMime(enc('<?xml version="1.0"?>\n<!-- c -->\n<svg viewBox="0 0 1 1"/>'))).toBe('image/svg+xml');
  });

  it('rejects a renamed EXE, a GIF and plain text', () => {
    expect(checkLogoUpload(EXE).ok).toBe(false);
    expect(checkLogoUpload(GIF).ok).toBe(false);
    expect(sniffLogoMime(enc('<html><svg></svg></html>'))).toBeNull();
    expect(sniffLogoMime(new Uint8Array())).toBeNull();
  });

  it('rejects files over 1 MB and empty files', () => {
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(PNG);
    expect(checkLogoUpload(big).ok).toBe(false);
    expect(checkLogoUpload(new Uint8Array()).ok).toBe(false);
    const atLimit = new Uint8Array(MAX_LOGO_BYTES);
    atLimit.set(PNG);
    expect(checkLogoUpload(atLimit)).toMatchObject({ ok: true, mime: 'image/png' });
  });

  it('replaces an SVG upload with its sanitized form', () => {
    const result = checkLogoUpload(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="5" height="5"/></svg>'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(new TextDecoder().decode(result.bytes)).not.toContain('script');
  });
});

describe('sanitizeSvg', () => {
  const wrap = (inner: string, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"${attrs}>${inner}</svg>`;

  it('keeps ordinary drawing elements and attributes', () => {
    const out = sanitizeSvg(
      wrap('<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><path d="M0 0L10 10" fill="url(#g)"/><text x="1" y="2">Hi &amp; bye</text>'),
    )!;
    expect(out).toContain('<path d="M0 0L10 10" fill="url(#g)"/>');
    expect(out).toContain('<linearGradient id="g">');
    expect(out).toContain('Hi &amp; bye');
    expect(out).toContain('viewBox="0 0 100 50"');
  });

  it('keeps a safe <style> element once and the result still decodes', async () => {
    const out = sanitizeSvg(wrap('<style>.a{fill:red}</style><rect class="a" width="5" height="5"/>'))!;
    expect(out.match(/<style>/g)).toHaveLength(1);
    expect(out).toContain('<style>.a{fill:red}</style>');
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(meta.width).toBeGreaterThan(0);
  });

  it('rejects CSS escapes in style text and style attributes', () => {
    const text = sanitizeSvg(wrap('<style>.a{fill:u\\72l(http://evil/x)}</style><rect class="a" width="1" height="1"/>'))!;
    expect(text).not.toContain('<style');
    expect(text).not.toContain('evil');
    const text2 = sanitizeSvg(wrap('<style>@\\69mport "http://evil/x";</style><rect width="1" height="1"/>'))!;
    expect(text2).not.toContain('evil');
    const attr = sanitizeSvg(wrap('<rect width="1" height="1" style="fill:u\\72l(http://evil/x)"/>'))!;
    expect(attr).not.toContain('evil');
    expect(attr).not.toContain('style=');
  });

  it('removes script elements with their content', () => {
    const out = sanitizeSvg(wrap('<script>alert(1)</script><rect width="1" height="1"/><script type="x"><![CDATA[ if (a<b) x() ]]></script>'))!;
    expect(out).not.toMatch(/script|alert|CDATA/i);
    expect(out).toContain('<rect');
  });

  it('removes event handler attributes', () => {
    const out = sanitizeSvg(wrap('<rect width="1" height="1" onclick="x()" onmouseover=\'y()\'/>', ' onload="alert(1)"'))!;
    expect(out).not.toMatch(/on(load|click|mouseover)/i);
    expect(out).not.toContain('alert');
  });

  it('removes javascript: and external hrefs, keeps in-document references', () => {
    const out = sanitizeSvg(
      wrap(
        '<a href="javascript:alert(1)"><rect id="r" width="1" height="1"/></a>' +
          '<use href="https://evil.example/x.svg#a"/><use xlink:href="javascript:alert(2)"/><use href="#r"/>' +
          '<image href="http://evil.example/p.png"/><rect fill="url(http://evil.example/p)"/>',
      ),
    )!;
    expect(out).not.toMatch(/javascript|evil\.example/i);
    expect(out).toContain('<use href="#r"/>');
  });

  it('hides nothing behind entities in attribute values', () => {
    const out = sanitizeSvg(wrap('<use href="&#106;avascript:alert(1)"/><use href="java&#x73;cript:alert(1)"/>'))!;
    expect(out).not.toMatch(/avascript|&#/i);
  });

  it('removes foreignObject with everything inside it', () => {
    const out = sanitizeSvg(
      wrap('<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><iframe src="x"></iframe>boo</div></foreignObject><circle r="3"/>'),
    )!;
    expect(out).not.toMatch(/foreignobject|iframe|boo|div/i);
    expect(out).toContain('<circle r="3"/>');
  });

  it('drops <style> that loads something, keeps harmless style', () => {
    expect(sanitizeSvg(wrap('<style>.a{fill:url(http://evil.example/x)}</style><rect class="a"/>'))).not.toMatch(/style|evil/i);
    expect(sanitizeSvg(wrap('<style>@import url(https://evil.example/a.css);</style><rect/>'))).not.toMatch(/style|import|evil/i);
    expect(sanitizeSvg(wrap('<style>.a{fill:#f00}</style><rect class="a"/>'))).toContain('<style>.a{fill:#f00}</style>');
    expect(sanitizeSvg(wrap('<rect style="fill:url(#g);stroke:red"/>'))).toContain('style="fill:url(#g);stroke:red"');
    expect(sanitizeSvg(wrap('<rect style="background:url(https://evil.example/x)"/>'))).not.toMatch(/evil/i);
  });

  it('drops animation elements, comments, doctype and entity tricks', () => {
    const out = sanitizeSvg(wrap('<animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onclick" to="x()"/><!-- hi --><rect/>'))!;
    expect(out).not.toMatch(/animate|<set|javascript|hi/i);
    expect(sanitizeSvg('<!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>')).toBeNull();
  });

  it('fails closed on anything that is not a clean SVG', () => {
    expect(sanitizeSvg('<html><body>x</body></html>')).toBeNull();
    expect(sanitizeSvg('<svg/onload=alert(1)>')).toBeNull();
    expect(sanitizeSvg('')).toBeNull();
  });

  it('adds the namespace when it is missing and closes open elements', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 4 4"><g><rect width="1" height="1"/>')!;
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out.endsWith('</g></svg>')).toBe(true);
  });

  it('reads the size from the viewBox or width/height', () => {
    expect(svgSize('<svg viewBox="0 0 120 40"></svg>')).toEqual({ width: 120, height: 40 });
    expect(svgSize('<svg width="64" height="32px"></svg>')).toEqual({ width: 64, height: 32 });
    expect(svgSize('<svg></svg>')).toBeNull();
  });
});

describe('brand form and snapshot schemas', () => {
  const form = {
    displayName: ' Hale SRL ',
    legalName: '',
    taxId: '',
    regNo: '',
    address: '',
    phone: '',
    email: 'a@b.ro',
    website: '',
    primaryColor: '#DC2626',
    secondaryColor: null,
  };

  it('trims text, lowercases colours and accepts empty colours', () => {
    expect(brandFormSchema.parse(form)).toMatchObject({ displayName: 'Hale SRL', primaryColor: '#dc2626', secondaryColor: null });
    expect(brandFormSchema.safeParse({ ...form, primaryColor: '' }).success).toBe(true);
    expect(brandFormSchema.safeParse({ ...form, primaryColor: 'red' }).success).toBe(false);
    expect(brandFormSchema.safeParse({ ...form, email: 'nope' }).success).toBe(false);
    expect(brandFormSchema.safeParse({ ...form, extra: 1 }).success).toBe(false);
  });

  it('validates a snapshot', () => {
    const snap = {
      v: 1,
      name: 'A',
      address: '',
      phone: '',
      email: '',
      website: '',
      colors: { primary: '#f5a623', text: '#1a1a1a', muted: '#6b7280', line: '#e5e7eb' },
      logoAssetId: null,
      logoSha256: null,
    };
    expect(brandingSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(brandingSnapshotSchema.safeParse({ ...snap, v: 2 }).success).toBe(false);
  });
});
