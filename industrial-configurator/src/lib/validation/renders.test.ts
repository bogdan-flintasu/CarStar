import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MAX_RENDER_BYTES, readJpegSize, validateRender, validateRenders } from './renders';

const image = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 160, b: 90 } } });
const jpeg = async (width = 1600, height = 1000, progressive = false) =>
  new Uint8Array(await image(width, height).jpeg({ quality: 85, progressive }).toBuffer());

describe('readJpegSize', () => {
  it('reads baseline and progressive JPEGs', async () => {
    expect(readJpegSize(await jpeg(1600, 1000))).toEqual({ width: 1600, height: 1000 });
    expect(readJpegSize(await jpeg(1120, 700, true))).toEqual({ width: 1120, height: 700 });
  });

  it('rejects other formats and broken files', async () => {
    const png = new Uint8Array(await image(1600, 1000).png().toBuffer());
    const webp = new Uint8Array(await image(1600, 1000).webp().toBuffer());
    const good = await jpeg();
    expect(readJpegSize(png)).toBeNull();
    expect(readJpegSize(webp)).toBeNull();
    expect(readJpegSize(good.slice(0, good.length - 10))).toBeNull(); // truncated: no EOI
    expect(readJpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull(); // no frame header
    expect(readJpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0xff, 0xd9]))).toBeNull(); // bad length
    expect(readJpegSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('is not fooled by a JPEG header glued to other data', async () => {
    const fake = new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode('<html>'), 0xff, 0xd9]);
    expect(readJpegSize(fake)).toBeNull();
  });
});

describe('validateRender', () => {
  it('accepts a 16:10 JPEG for a known view', async () => {
    const check = validateRender('front', await jpeg());
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.render).toMatchObject({ view: 'front', mime: 'image/jpeg', width: 1600, height: 1000 });
  });

  it('rejects unknown views, wrong sizes, wrong ratios and big files', async () => {
    expect(validateRender('interior', await jpeg()).ok).toBe(false);
    expect(validateRender('__proto__', await jpeg()).ok).toBe(false);
    expect(validateRender('front', new Uint8Array()).ok).toBe(false);
    expect(validateRender('front', await jpeg(320, 200)).ok).toBe(false);
    expect(validateRender('front', await jpeg(4000, 2500)).ok).toBe(false);
    expect(validateRender('front', await jpeg(1600, 1200)).ok).toBe(false);
    const big = new Uint8Array(MAX_RENDER_BYTES + 1);
    big.set(await jpeg());
    expect(validateRender('front', big).ok).toBe(false);
  });
});

describe('validateRenders', () => {
  it('accepts up to one picture per view', async () => {
    const bytes = await jpeg();
    const result = validateRenders(['front', 'rear', 'side', 'aerial'].map((view) => ({ view, bytes })));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.renders.map((r) => r.view)).toEqual(['front', 'rear', 'side', 'aerial']);
    expect(validateRenders([]).ok).toBe(true);
  });

  it('rejects duplicates, too many pictures and any invalid one', async () => {
    const bytes = await jpeg();
    expect(validateRenders([{ view: 'front', bytes }, { view: 'front', bytes }]).ok).toBe(false);
    const five = ['front', 'rear', 'side', 'aerial', 'front'].map((view) => ({ view, bytes }));
    expect(validateRenders(five).ok).toBe(false);
    expect(validateRenders([{ view: 'front', bytes }, { view: 'rear', bytes: new Uint8Array([1, 2, 3]) }]).ok).toBe(false);
  });
});
