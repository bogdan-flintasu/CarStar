import { z } from 'zod';
import { hallColorsSchema } from './colors';

/**
 * Allowed hall dimensions in metres. These mirror the sliders in
 * DimensionsStep (length 12–102, width 8–20, height 3–6). Validation checks
 * the range only, not the slider step, so a later UI change to discrete
 * widths does not start rejecting saved configurations.
 */
export const DIMENSION_LIMITS = {
  length: { min: 12, max: 102 },
  width: { min: 8, max: 20 },
  height: { min: 3, max: 6 },
} as const;

/** Insulation thickness in mm: 0 means "not insulated", otherwise 30–250. */
export const INSULATION_LIMITS = { min: 30, max: 250 } as const;

export const MAX_OPENINGS = 200;

const finiteNonNegative = z.number().finite().nonnegative();

const ranged = (limits: { min: number; max: number }) =>
  z.number().finite().min(limits.min).max(limits.max);

export const openingTypeSchema = z.enum(['window', 'door', 'garageDoor']);
export const wallIdSchema = z.enum(['PereteSTG', 'PereteDR', 'PereteFata', 'PereteSpate']);

/** Longest wall face in metres; bounds every metric opening coordinate. */
const MAX_WALL_M = DIMENSION_LIMITS.length.max;
/** Generous vertical bound (eave height plus a future gable). */
const MAX_OPENING_HEIGHT_M = 30;

const openingBase = {
  id: z.string().min(1).max(64),
  type: openingTypeSchema,
  wallId: wallIdSchema,
  width: z.number().finite().positive().max(MAX_WALL_M),
  height: z.number().finite().positive().max(MAX_OPENING_HEIGHT_M),
};

/**
 * Current opening shape (v1, metres), mirrors `Opening` in `@/stores/useOpeningsStore`:
 * offsetX = wall start -> left edge, sill = floor -> bottom edge.
 * Fine-grained clamping to the actual wall is done client-side by `clampOpening`.
 */
export const metricOpeningSchema = z.object({
  ...openingBase,
  offsetX: z.number().finite().min(0).max(MAX_WALL_M),
  sill: z.number().finite().min(0).max(MAX_OPENING_HEIGHT_M),
});

/** Pre-v1 shape (normalised centre position), still found in old saved links. */
export const legacyOpeningSchema = z.object({
  ...openingBase,
  posX: z.number().finite().min(0).max(1),
  posY: z.number().finite().min(0).max(1),
});

/** One opening as stored in `openingsList`: the metric shape, or the legacy shape. */
export const openingSchema = z.union([metricOpeningSchema, legacyOpeningSchema]);

export const openingsCountSchema = z.object({
  windows: z.number().int().min(0).max(MAX_OPENINGS),
  doors: z.number().int().min(0).max(MAX_OPENINGS),
  garageDoors: z.number().int().min(0).max(MAX_OPENINGS),
});

export const dimensionsSchema = z.object({
  length: ranged(DIMENSION_LIMITS.length),
  width: ranged(DIMENSION_LIMITS.width),
  height: ranged(DIMENSION_LIMITS.height),
});

/**
 * The configuration payload produced by `getConfigurationData()` plus
 * `openingsList`. Unknown keys are stripped (zod default), so nothing outside
 * this shape is ever stored. Extend this schema when the store adds fields.
 *
 * `floorArea`, `numberOfBays` and `estimatedPrice` are client-derived and
 * informational only; the server must not trust them (see B5).
 */
export const configurationDataSchema = z.object({
  dimensions: dimensionsSchema,
  /** Missing on configurations saved before roof types existed (= gable). */
  roofType: z.enum(['gable', 'mono']).optional(),
  highSide: z.enum(['left', 'right']).optional(),
  foundation: z.boolean(),
  sandwichPanels: z.boolean(),
  insulation: z.union([z.literal(0), ranged(INSULATION_LIMITS)]),
  openings: openingsCountSchema.optional(),
  openingsList: z.array(openingSchema).max(MAX_OPENINGS).default([]),
  /** Chosen colour per component. Missing on configurations saved before colours existed (= the defaults). */
  colors: hallColorsSchema.optional(),
  floorArea: finiteNonNegative.optional(),
  numberOfBays: z.number().int().min(0).max(1000).optional(),
  estimatedPrice: finiteNonNegative.optional(),
});

export type ConfigurationData = z.infer<typeof configurationDataSchema>;
export type OpeningInput = z.infer<typeof openingSchema>;

/** Optional free-text that may be empty: '' and whitespace become null. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));

export const PHONE_PATTERN = /^[+\d][\d\s().-]{3,39}$/;

export const contactNameSchema = optionalText(100);
export const contactPhoneSchema = optionalText(40).refine(
  (v) => v === null || PHONE_PATTERN.test(v),
  { message: 'Invalid phone number' },
);
export const contactEmailSchema = z.email().max(254);

/** Body of `POST /api/configurations`. */
export const createConfigurationSchema = z.object({
  data: configurationDataSchema,
  userName: contactNameSchema,
  userEmail: z
    .union([contactEmailSchema, z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  userPhone: contactPhoneSchema,
});

export type CreateConfigurationInput = z.infer<typeof createConfigurationSchema>;

/** Tokens are generated with `nanoid(12)`. */
export const CONFIGURATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{12}$/;
export const configurationTokenSchema = z.string().regex(CONFIGURATION_TOKEN_PATTERN);
