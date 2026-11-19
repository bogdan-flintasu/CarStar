/**
 * Where uploaded files (the logo) live. Today: the `Asset` table (SQLite keeps the deployment to one file). Every read
 * and write goes through this module, so moving the bytes to disk or S3 later changes only this file.
 */
import { createHash } from 'crypto';
import prisma from '@/lib/prisma';

export const DEFAULT_ORGANIZATION_ID = 'default';

export interface AssetInfo {
  id: string;
  kind: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  sha256: string;
}

export interface StoredAsset extends AssetInfo {
  bytes: Uint8Array;
}

export interface NewAsset {
  organizationId?: string;
  kind: 'logo';
  mime: string;
  bytes: Uint8Array;
  width?: number | null;
  height?: number | null;
}

const INFO_SELECT = { id: true, kind: true, mime: true, size: true, width: true, height: true, sha256: true } as const;

export const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Stores a file; the same bytes already stored for the organization are reused instead of duplicated. */
export async function saveAsset(input: NewAsset): Promise<AssetInfo> {
  const organizationId = input.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const sha256 = sha256Hex(input.bytes);
  const existing = await prisma.asset.findFirst({ where: { organizationId, kind: input.kind, sha256 }, select: INFO_SELECT });
  if (existing) return existing;
  return prisma.asset.create({
    data: {
      organizationId,
      kind: input.kind,
      mime: input.mime,
      bytes: new Uint8Array(input.bytes),
      size: input.bytes.byteLength,
      width: input.width ?? null,
      height: input.height ?? null,
      sha256,
    },
    select: INFO_SELECT,
  });
}

/** One file with its bytes, or null. */
export async function loadAsset(id: string): Promise<StoredAsset | null> {
  const row = await prisma.asset.findUnique({ where: { id }, select: { ...INFO_SELECT, bytes: true } });
  return row ?? null;
}

/** One file's details without its bytes, or null. */
export async function loadAssetInfo(id: string): Promise<AssetInfo | null> {
  return prisma.asset.findUnique({ where: { id }, select: INFO_SELECT });
}

export async function deleteAsset(id: string): Promise<void> {
  await prisma.asset.delete({ where: { id } }).catch(() => undefined);
}

/**
 * Whether a saved quote's branding snapshot points at this asset. A referenced asset must be kept: old PDFs show the
 * logo they were saved with.
 */
export async function isAssetReferenced(id: string): Promise<boolean> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.configuration.findMany({
      where: { organizationId: { not: null } },
      select: { id: true, brandingSnapshot: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.some((r) => JSON.stringify(r.brandingSnapshot ?? null).includes(`"${id}"`))) return true;
    if (rows.length < 500) return false;
    cursor = rows[rows.length - 1].id;
  }
}

/** Deletes the asset unless a saved quote still refers to it. Returns whether it was deleted. */
export async function deleteAssetIfUnused(id: string): Promise<boolean> {
  if (await isAssetReferenced(id)) return false;
  await deleteAsset(id);
  return true;
}
