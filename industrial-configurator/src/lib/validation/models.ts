import { z } from 'zod';
import { configurationDataSchema } from './configuration';

/** A predefined hall: the parts of a configuration that describe the hall itself (no price, no contact details). */
export const hallModelDataSchema = configurationDataSchema.pick({
  dimensions: true,
  roofType: true,
  highSide: true,
  foundation: true,
  sandwichPanels: true,
  insulation: true,
  openingsList: true,
  colors: true,
});
export type HallModelData = z.infer<typeof hallModelDataSchema>;

/** About 450 KB of image: a 640 x 400 WebP screenshot is typically 20-60 KB. */
export const MAX_THUMBNAIL_CHARS = 600_000;
export const THUMBNAIL_PATTERN = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

export const thumbnailSchema = z.string().max(MAX_THUMBNAIL_CHARS).regex(THUMBNAIL_PATTERN);

export const MODEL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Body of `POST /api/admin/models`. */
export const hallModelCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).default(''),
  data: hallModelDataSchema,
  thumbnail: thumbnailSchema.optional(),
  published: z.boolean().default(true),
});

/** Body of `PATCH /api/admin/models/[id]`: any subset, at least one field. */
export const hallModelPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(400),
    data: hallModelDataSchema,
    thumbnail: thumbnailSchema,
    published: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

/** A model as the configurator lists it. */
export interface HallModelSummary {
  id: string;
  name: string;
  description: string;
  data: HallModelData;
  /** Versioned URL of the screenshot, or null when there is none. */
  thumbnailUrl: string | null;
}

/** Admin listing: also unpublished models, their order and dates. */
export interface HallModelAdmin extends HallModelSummary {
  published: boolean;
  sortOrder: number;
  updatedAt: string;
}

/** "24 × 12 × 5 m · 2 ape": a hall's size and roof type, for model cards and lists. */
export function hallLabel(data: Pick<HallModelData, 'dimensions' | 'roofType'>): string {
  const { length, width, height } = data.dimensions;
  return `${length} × ${width} × ${height} m · ${data.roofType === 'mono' ? 'o apă' : '2 ape'}`;
}
