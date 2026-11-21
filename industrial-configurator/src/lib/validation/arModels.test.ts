import { describe, expect, it } from 'vitest';
import { arFormatOfFile, isGlb, isUsdz, MAX_AR_BYTES, validateArFile, validateArFiles } from './arModels';

/** A minimal GLB header: magic, version, total length, then a JSON chunk header. */
function glb(length = 28, version = 2): Uint8Array {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, version, true);
  view.setUint32(8, length, true);
  view.setUint32(12, 8, true);
  view.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

/** A zip whose first local file entry is `name`, stored with `compression`. */
function zip(name = 'model.usda', compression = 0): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const bytes = new Uint8Array(30 + nameBytes.length + 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(8, compression, true);
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  return bytes;
}

describe('AR file headers', () => {
  it('accepts a glTF 2.0 binary whose declared length is its own', () => {
    expect(isGlb(glb())).toBe(true);
    expect(isGlb(glb(28, 1))).toBe(false);
    const truncated = glb(40).subarray(0, 30);
    expect(isGlb(truncated)).toBe(false);
    expect(isGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}'))).toBe(false);
  });

  it('accepts a zip that starts with a stored USD layer', () => {
    expect(isUsdz(zip('model.usda'))).toBe(true);
    expect(isUsdz(zip('scene.USDC'))).toBe(true);
    expect(isUsdz(zip('model.usda', 8))).toBe(false); // deflated: not a USDZ
    expect(isUsdz(zip('evil.html'))).toBe(false);
    expect(isUsdz(glb())).toBe(false);
  });
});

describe('validateArFile(s)', () => {
  it('checks the format by its bytes, not by the field name alone', () => {
    expect(validateArFile('glb', glb()).ok).toBe(true);
    expect(validateArFile('glb', zip()).ok).toBe(false);
    expect(validateArFile('usdz', glb()).ok).toBe(false);
    expect(validateArFile('obj', glb()).ok).toBe(false);
    expect(validateArFile('glb', new Uint8Array()).ok).toBe(false);
  });

  it('rejects files over the budget', () => {
    expect(validateArFile('glb', new Uint8Array(MAX_AR_BYTES.glb + 1))).toEqual({ ok: false, error: 'glb: file too large' });
  });

  it('needs both files, each once', () => {
    expect(validateArFiles([{ format: 'glb', bytes: glb() }, { format: 'usdz', bytes: zip() }]).ok).toBe(true);
    expect(validateArFiles([{ format: 'glb', bytes: glb() }])).toEqual({ ok: false, error: 'Missing usdz' });
    expect(validateArFiles([{ format: 'glb', bytes: glb() }, { format: 'glb', bytes: glb() }]).ok).toBe(false);
  });

  it('maps the public file names', () => {
    expect(arFormatOfFile('hall.glb')).toBe('glb');
    expect(arFormatOfFile('hall.usdz')).toBe('usdz');
    expect(arFormatOfFile('../hall.glb')).toBeNull();
  });
});
