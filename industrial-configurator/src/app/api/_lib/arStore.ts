/**
 * Where the AR files of saved configurations live (docs/plans/ar.md). Today: the `ConfigurationArModel` table, next to
 * the quote pictures (renderStore.ts). Every read and write goes through this module, so moving the bytes to disk or
 * S3 later changes only this file.
 */
import prisma from '@/lib/prisma';
import { AR_FILE_NAMES, AR_FORMATS, isArFormat, type ArFormat, type ValidArFile } from '@/lib/validation/arModels';

export interface ArUrls {
  glb: string;
  usdz: string;
}

/** Public URL of one AR file. The files never change once saved, so the URL can be cached for good. */
export const arFileUrl = (token: string, format: ArFormat) => `/api/configurations/${token}/ar/${AR_FILE_NAMES[format]}`;

/** Public page that shows the configuration in AR. */
export const arPageUrl = (token: string) => `/configuration/${token}/ar`;

/**
 * Stores both AR files of a configuration, once: false (and nothing written) when it already has AR files, so a quote's
 * AR model is frozen like its pictures.
 */
export async function saveArFiles(configurationId: string, files: readonly ValidArFile[]): Promise<boolean> {
  try {
    await prisma.$transaction(
      files.map((f) =>
        prisma.configurationArModel.create({
          data: { configurationId, format: f.format, bytes: new Uint8Array(f.bytes), size: f.bytes.byteLength },
        }),
      ),
    );
    return true;
  } catch (error) {
    // Unique (configurationId, format): another upload got there first.
    if ((error as { code?: string }).code === 'P2002') return false;
    throw error;
  }
}

/** The URLs of a configuration's AR files when it has both, else null. */
export async function arUrlsFor(configurationId: string, token: string): Promise<ArUrls | null> {
  const rows = await prisma.configurationArModel.findMany({ where: { configurationId }, select: { format: true } });
  const formats = new Set(rows.map((r) => r.format));
  return AR_FORMATS.every((f) => formats.has(f)) ? { glb: arFileUrl(token, 'glb'), usdz: arFileUrl(token, 'usdz') } : null;
}

/** One AR file with its bytes, or null. */
export async function loadArFile(configurationId: string, format: ArFormat): Promise<Uint8Array | null> {
  const row = await prisma.configurationArModel.findUnique({
    where: { configurationId_format: { configurationId, format } },
    select: { format: true, bytes: true },
  });
  return row && isArFormat(row.format) ? row.bytes : null;
}

/** Counts one opening of the AR page. */
export async function countArView(configurationId: string): Promise<void> {
  await prisma.configuration.update({ where: { id: configurationId }, data: { arViews: { increment: 1 } } });
}
