/**
 * Engineering constants of the CarStar portal-frame hall.
 *
 * Every value is either a steel-construction rule of thumb or a dimension measured on the source
 * frame (`da.glb`, a 12 m wide / 6 m bay model; see public/models/ASSET_CONTRACT.md §4).
 * All lengths are metres, all angles degrees unless the name says otherwise.
 * Nothing here depends on the hall's width, height or length: those go through computeHallLayout.
 */

// ── Frame geometry ────────────────────────────────────────────────────────────

/** Roof pitch. Source frame: purlin seats rise 1.08 m over 6.12 m = 10.0°, the usual minimum-slope sandwich roof. */
export const ROOF_PITCH_DEG = 10;

/** Largest frame spacing. 6 m is the source bay and the economic limit for the light purlins used here. */
export const MAX_BAY_SPACING = 6;

/** Column section depth across the hall (X). Source: inner flange face 6.00, outer 6.29 (an IPE 300 class profile). */
export const COLUMN_DEPTH = 0.3;

/** Flange width of columns and rafters along the hall (Z). Source: 0.15 (IPE 300 flange). */
export const FRAME_FLANGE_WIDTH = 0.15;

/** Rafter section depth, perpendicular to its axis. Source: 0.30, same profile as the column. */
export const RAFTER_DEPTH = 0.3;

/** Base plate thickness; the column steel starts on top of it. Source: plate from y = 0 to 0.02. */
export const BASE_PLATE_THICKNESS = 0.02;

/**
 * Height of the fixed eave joint (cap plates + column extension) between the top of the column steel and the
 * rafter's bottom flange at the inner column face. Source: 6.0735 - 5.815. The kit piece `EaveHaunch` fills it.
 */
export const EAVE_JOINT_HEIGHT = 0.2585;

// ── Purlins ───────────────────────────────────────────────────────────────────

/** Purlin section size (square envelope, set square to the roof slope). Source: 0.106 x 0.10. */
export const PURLIN_SIZE = 0.1;

/**
 * Largest purlin spacing measured along the slope. Sandwich roof panels span about 1.5-2 m under Romanian snow
 * loads; 1.6 m reproduces the source frame (5 purlins per side at 12 m, 1.55 m apart).
 */
export const MAX_PURLIN_SPACING = 1.6;

/** Horizontal distance from the ridge to the first purlin seat: clears the apex splice plates. Source: 0.09. */
export const RIDGE_PURLIN_OFFSET = 0.1;

/** Eave purlin seat, measured inwards from the outer column face, so the purlin stays over the column. Source: 6.29 - 6.22. */
export const EAVE_PURLIN_INSET = 0.07;

// ── Cladding ──────────────────────────────────────────────────────────────────

/** Gap between the outer column face and the side cladding (girt cleats). Source: cleat 0.12 deep. */
export const GIRT_DEPTH = 0.12;

/** Largest vertical spacing of the cladding fixings (girt cleats) on a column; wall panels span up to about 1.5 m. */
export const MAX_GIRT_SPACING = 1.5;

/** The lowest and the highest cleat stay this far from the floor and from the top of the column steel. */
export const GIRT_END_CLEARANCE = 0.3;

/** Thickness of single-skin trapezoidal sheeting, used when no sandwich panels are selected (T40 profile depth). */
export const SHEET_THICKNESS = 0.04;

/** Roof projection beyond the outer wall face on all four sides: a drip edge into the gutter. */
export const ROOF_OVERHANG = 0.05;

// ── Slab and site ─────────────────────────────────────────────────────────────

/** Industrial floor slab thickness (15-20 cm is standard for light vehicles). Y = 0 is the finished floor. */
export const SLAB_THICKNESS = 0.2;

/** Concrete apron around the cladding. Source slab projects 2.0-2.3 m beyond the walls. */
export const SLAB_APRON = 2;

// ── Rainwater ─────────────────────────────────────────────────────────────────

/** Eave gutter width, outwards from the wall. Source: 0.11. */
export const GUTTER_WIDTH = 0.11;

/** Eave gutter depth. Source: 0.054. */
export const GUTTER_DEPTH = 0.054;

/** Height of the outlet shoe under each downpipe; the pipe itself starts on top of it. Kit `DownpipeShoe`: 0.066. */
export const DOWNPIPE_SHOE_HEIGHT = 0.07;

/** Downpipes stand this far in from each end of the side wall (source: only at the four corners). */
export const DOWNPIPE_END_INSET = 0.15;

// ── Input limits (what the product sells) ─────────────────────────────────────

/** Ranges offered by the configurator. computeHallLayout itself accepts any positive size. */
export const HALL_LIMITS = {
  width: { min: 8, max: 20 },
  height: { min: 3, max: 6 },
  length: { min: 12, max: 102 },
  insulationMm: { min: 30, max: 250 },
} as const;

/** Guards `ceil()` against floating-point noise, e.g. 18 / 6 = 3.0000000000000004 must stay 3 bays. */
export const COUNT_EPSILON = 1e-9;
