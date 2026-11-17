import prisma from '@/lib/prisma';
import { hallModelDataSchema, type HallModelAdmin, type HallModelSummary } from '@/lib/validation/models';

/** A model with its screenshot and up to 200 openings stays well below this. */
export const MAX_MODEL_BODY_BYTES = 700 * 1024;

type Row = {
  id: string;
  name: string;
  description: string;
  data: unknown;
  thumbnail: string;
  published: boolean;
  sortOrder: number;
  updatedAt: Date;
};

/** Every column but the (large) thumbnail, plus whether there is one. */
export const MODEL_LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  data: true,
  published: true,
  sortOrder: true,
  updatedAt: true,
} as const;

export const thumbnailUrl = (id: string, updatedAt: Date) => `/api/models/${id}/thumbnail?v=${updatedAt.getTime()}`;

/**
 * A DB row as the API returns it. Rows whose data no longer matches the schema (an older format) are dropped
 * rather than breaking the configurator.
 */
export function toAdminModel(row: Omit<Row, 'thumbnail'> & { hasThumbnail: boolean }): HallModelAdmin | null {
  const data = hallModelDataSchema.safeParse(row.data);
  if (!data.success) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    data: data.data,
    thumbnailUrl: row.hasThumbnail ? thumbnailUrl(row.id, row.updatedAt) : null,
    published: row.published,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSummary({ id, name, description, data, thumbnailUrl: url }: HallModelAdmin): HallModelSummary {
  return { id, name, description, data, thumbnailUrl: url };
}

/** Models in display order; `publishedOnly` for the public list. */
export async function listModels(publishedOnly: boolean): Promise<HallModelAdmin[]> {
  const rows = await prisma.hallModel.findMany({
    where: publishedOnly ? { published: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: MODEL_LIST_SELECT,
  });
  // Whether a thumbnail exists, without loading the images.
  const withThumb = new Set(
    (
      await prisma.hallModel.findMany({
        where: { id: { in: rows.map((r) => r.id) }, NOT: { thumbnail: '' } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  return rows
    .map((row) => toAdminModel({ ...row, hasThumbnail: withThumb.has(row.id) }))
    .filter((m): m is HallModelAdmin => m !== null);
}

/** The bytes and type of a `data:` URL thumbnail. */
export function decodeThumbnail(dataUrl: string): { type: string; bytes: Buffer } | null {
  const match = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(dataUrl);
  return match ? { type: match[1], bytes: Buffer.from(match[2], 'base64') } : null;
}
