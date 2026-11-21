/**
 * Validation of the AR files uploaded for a configuration (docs/plans/ar.md): one binary glTF (Android Scene Viewer,
 * model-viewer) and one USDZ (iOS AR Quick Look). Nothing the client declares is trusted: the type is read from the
 * header bytes and the size is the real byte count. The files are never parsed beyond the header.
 */

export const AR_FORMATS = ['glb', 'usdz'] as const;
export type ArFormat = (typeof AR_FORMATS)[number];

/** Budgets of the plan: GLB ≤ 15 MB, USDZ ≤ 25 MB. */
export const MAX_AR_BYTES: Readonly<Record<ArFormat, number>> = { glb: 15 * 1024 * 1024, usdz: 25 * 1024 * 1024 };

export const AR_MIME: Readonly<Record<ArFormat, string>> = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' };

/** Public file name of each format under `/api/configurations/<token>/ar/`. */
export const AR_FILE_NAMES: Readonly<Record<ArFormat, string>> = { glb: 'hall.glb', usdz: 'hall.usdz' };

export function isArFormat(value: string): value is ArFormat {
  return (AR_FORMATS as readonly string[]).includes(value);
}

/** The format served under a public file name (`hall.glb`, `hall.usdz`), or null. */
export function arFormatOfFile(file: string): ArFormat | null {
  return AR_FORMATS.find((f) => AR_FILE_NAMES[f] === file) ?? null;
}

const u32 = (bytes: Uint8Array, at: number) =>
  (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
const u16 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"

/** A binary glTF 2.0: "glTF" magic, version 2, the header's total length equal to the file's, a JSON chunk first. */
export function isGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 20) return false;
  return u32(bytes, 0) === GLB_MAGIC && u32(bytes, 4) === 2 && u32(bytes, 8) === bytes.length && u32(bytes, 16) === GLB_CHUNK_JSON;
}

const ZIP_LOCAL_FILE = 0x04034b50; // "PK\x03\x04"

/**
 * A USDZ: a zip whose first entry is stored uncompressed (the USDZ spec) and is a USD layer (`.usda` / `.usdc`).
 */
export function isUsdz(bytes: Uint8Array): boolean {
  if (bytes.length < 30 || u32(bytes, 0) !== ZIP_LOCAL_FILE) return false;
  const compression = u16(bytes, 8);
  const nameLength = u16(bytes, 26);
  if (compression !== 0 || nameLength === 0 || 30 + nameLength > bytes.length) return false;
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength)).toLowerCase();
  return name.endsWith('.usda') || name.endsWith('.usdc');
}

export interface ValidArFile {
  format: ArFormat;
  bytes: Uint8Array;
}

export type ArCheck = { ok: true; file: ValidArFile } | { ok: false; error: string };

export function validateArFile(format: string, bytes: Uint8Array): ArCheck {
  if (!isArFormat(format)) return { ok: false, error: `Unknown format "${format.slice(0, 20)}"` };
  if (bytes.length === 0) return { ok: false, error: `${format}: empty file` };
  if (bytes.length > MAX_AR_BYTES[format]) return { ok: false, error: `${format}: file too large` };
  const valid = format === 'glb' ? isGlb(bytes) : isUsdz(bytes);
  if (!valid) return { ok: false, error: `${format}: not a ${format.toUpperCase()} file` };
  return { ok: true, file: { format, bytes } };
}

/** Both files of one upload, each once. */
export function validateArFiles(
  files: readonly { format: string; bytes: Uint8Array }[],
): { ok: true; files: ValidArFile[] } | { ok: false; error: string } {
  const seen = new Set<string>();
  const valid: ValidArFile[] = [];
  for (const file of files) {
    if (seen.has(file.format)) return { ok: false, error: `Duplicate file "${file.format.slice(0, 20)}"` };
    seen.add(file.format);
    const check = validateArFile(file.format, file.bytes);
    if (!check.ok) return check;
    valid.push(check.file);
  }
  const missing = AR_FORMATS.filter((f) => !seen.has(f));
  if (missing.length > 0) return { ok: false, error: `Missing ${missing.join(', ')}` };
  return { ok: true, files: valid };
}
