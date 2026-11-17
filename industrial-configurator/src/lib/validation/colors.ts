import { z } from 'zod';
import { COLOR_COMPONENTS, HEX_PATTERN } from '@/lib/colors';
import { MAX_UNIT_PRICE } from './prices';

export const MAX_COLOR_OPTIONS = 200;

export const colorComponentSchema = z.enum(COLOR_COMPONENTS);
const hex = z.string().regex(HEX_PATTERN).transform((v) => v.toLowerCase());
const colorId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const colorOptionSchema = z.strictObject({
  id: colorId,
  component: colorComponentSchema,
  name: z.string().trim().min(1).max(60),
  ral: z.string().trim().max(12),
  hex,
  surcharge: z.number().finite().nonnegative().max(MAX_UNIT_PRICE),
  isDefault: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
});

/**
 * Body of `PUT /api/admin/colors`: the whole catalogue. Ids are unique, every component has at least one colour and
 * exactly one default.
 */
export const colorPaletteSchema = z
  .array(colorOptionSchema)
  .max(MAX_COLOR_OPTIONS)
  .superRefine((options, ctx) => {
    const ids = new Set<string>();
    for (const o of options) {
      if (ids.has(o.id)) ctx.addIssue({ code: 'custom', message: `Duplicate id ${o.id}` });
      ids.add(o.id);
    }
    for (const component of COLOR_COMPONENTS) {
      const own = options.filter((o) => o.component === component);
      if (own.length === 0) ctx.addIssue({ code: 'custom', message: `${component}: no colours` });
      if (own.filter((o) => o.isDefault).length !== 1) {
        ctx.addIssue({ code: 'custom', message: `${component}: exactly one default colour is required` });
      }
    }
  });

/** A customer's choice for one component, as saved in a configuration. The server re-resolves it by id. */
export const colorChoiceSchema = z.object({
  id: colorId,
  name: z.string().max(60),
  hex,
});

export const hallColorsSchema = z.object(
  Object.fromEntries(COLOR_COMPONENTS.map((c) => [c, colorChoiceSchema.optional()])) as Record<
    (typeof COLOR_COMPONENTS)[number],
    z.ZodOptional<typeof colorChoiceSchema>
  >,
);
