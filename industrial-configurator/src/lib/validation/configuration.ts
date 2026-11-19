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

/** Anchor coordinates in metres (from a bay's column, a wall's centre or its start): bounded with margin. */
const MAX_ANCHOR_M = 200;
const anchorMetres = z.number().finite().min(-MAX_ANCHOR_M).max(MAX_ANCHOR_M);

/**
 * Where the user put an opening (v2), mirrors `OpeningAnchor` in `@/components/3d/openings/types`. Strict: unknown
 * keys and kinds are rejected. Whether the kind suits the wall is checked client-side (`normalizeIntents`).
 */
export const openingAnchorSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('bay'),
    bay: z.number().int().min(0).max(1000),
    offset: z.union([z.literal('centre'), anchorMetres]),
  }),
  z.strictObject({ kind: z.literal('axis'), fromCentre: anchorMetres }),
  z.strictObject({ kind: z.literal('wallStart'), offsetX: z.number().finite().min(0).max(MAX_ANCHOR_M) }),
]);

/**
 * Current opening shape (metres), mirrors `Opening` in `@/stores/useOpeningsStore`:
 * offsetX = wall start -> left edge, sill = floor -> bottom edge. v1 has only these; v2 adds the user's `anchor`
 * (the placed rectangle stays, for the price, the quote and older readers).
 * Fine-grained clamping to the actual wall is done client-side.
 */
export const metricOpeningSchema = z.object({
  ...openingBase,
  offsetX: z.number().finite().min(0).max(MAX_WALL_M),
  sill: z.number().finite().min(0).max(MAX_OPENING_HEIGHT_M),
  anchor: openingAnchorSchema.optional(),
  /** Reserved for symmetric twins (T1e). */
  linkId: z.string().min(1).max(64).optional(),
});

/** Pre-v1 shape (normalised centre position), still found in old saved links. */
export const legacyOpeningSchema = z.object({
  ...openingBase,
  posX: z.number().finite().min(0).max(1),
  posY: z.number().finite().min(0).max(1),
  /** Anchors are v2 only: a malformed one must not slip through as a legacy opening. */
  anchor: z.never().optional(),
});

/** One opening as stored in `openingsList`: v2 / v1 (metric, with or without an anchor) or v0 (legacy). */
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
  /** The predefined hall the customer started from, if any (informational; the server checks it exists). */
  model: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), name: z.string().max(80) }).optional(),
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
