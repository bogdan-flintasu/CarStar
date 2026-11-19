/**
 * Adaptive quality of the live 3D view: the ladder of settings and the frame-time governor that moves along it.
 * Pure (no React, no three.js, no DOM): time comes in as frame durations, so it is unit-tested without a browser.
 *
 * The ladder starts at the device tier's settings (hardwareTier.ts) and lowers, one step at a time and in this order:
 *   1. environment reflections off,
 *   2. shadow map size down (2048 -> 1024 -> 512),
 *   3. far detail off (bolts drawn only closer to the camera, see qualityLod.ts),
 *   4. screen resolution (DPR) down, in 0.25 steps, to a floor of 1.
 * Steps that would change nothing on this device (e.g. no environment on a low tier) are left out.
 *
 * ALL tuning numbers live in QUALITY_TUNING / QUALITY_LADDER below (and the LOD ones in qualityLod.ts).
 */

/** What the live view is drawn with at one level of the ladder. */
export interface LiveQuality {
  /** drei `<Environment>` reflections (image-based light). */
  environment: boolean;
  /** Shadow map width = height, texels. */
  shadowMapSize: number;
  /** Bolts and fittings drawn out to their normal distance (off: only close to the camera). */
  farDetail: boolean;
  /** Canvas device pixel ratio. */
  dpr: number;
}

/** The device tier's settings the ladder starts from (a subset of hardwareTier's GraphicsSettings). */
export interface QualityBase {
  enableEnvironment: boolean;
  shadowMapSize: number;
  dpr: readonly [min: number, max: number];
}

export const QUALITY_LADDER = {
  /** Shadow map sizes tried in turn below the tier's own size. */
  shadowSteps: [1024, 512],
  /** DPR is lowered by this much per level... */
  dprStep: 0.25,
  /** ...down to this floor (never below 1: text-sharp edges matter more than the last few fps). */
  dprFloor: 1,
} as const;

export const QUALITY_TUNING = {
  /** The frame time the governor defends: 30 fps. */
  targetFrameMs: 1000 / 30,
  /** Median frame time above this lowers quality one level (~36 fps: act before the target is missed). */
  slowFrameMs: 28,
  /** Median frame time below this counts towards raising quality back (50 fps; a 60 Hz screen caps at 16.7). */
  fastFrameMs: 20,
  /** Rolling window of rendered frames the median is taken over. */
  sampleWindow: 20,
  /** Frames ignored right after a change (new shaders, resized buffers), before sampling again. */
  cooldownFrames: 10,
  /** Rendered time (sum of fast frames, not wall time) that must pass before raising one level. */
  raiseAfterMs: 2000,
  /** A level that turns slow again within `probationMs` of rendered time after a raise doubles the wait above... */
  raiseBackoff: 2,
  /** ...up to this. */
  maxRaiseAfterMs: 30000,
  probationMs: 3000,
  /** One frame counts for at most this much (a shader compile or GC hitch is not a trend). */
  maxSampleMs: 250,
  /** No sample in the first moments of the view (textures uploading, shaders compiling, the hall being framed). */
  startupGraceMs: 3000,
  /** After an offscreen render (quote renders, snapshots) no sample is taken and no change applied for this long. */
  offscreenHoldMs: 1500,
} as const;

export type QualityTuning = { -readonly [K in keyof typeof QUALITY_TUNING]: number };

/**
 * Scene-cost budgets per device tier (estimated triangles, see qualityLod.ts `estimateHallCost`): a hall over its
 * tier's budget starts in Auto mode with far detail already off (the governor may raise it back when frames allow).
 */
export const TRIANGLE_BUDGET = {
  low: 120_000,
  medium: 250_000,
  high: Infinity,
  ultra: Infinity,
} as const;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The levels for this device, best first. Level 0 is exactly the tier's settings ("Calitate: Ridicată"). */
export function qualityLadder(base: QualityBase, devicePixelRatio: number): LiveQuality[] {
  const [minDpr, maxDpr] = base.dpr;
  let current: LiveQuality = {
    environment: base.enableEnvironment,
    shadowMapSize: base.shadowMapSize,
    farDetail: true,
    dpr: round2(Math.min(maxDpr, Math.max(minDpr, devicePixelRatio || 1))),
  };
  const ladder = [current];
  const push = (change: Partial<LiveQuality>) => {
    current = { ...current, ...change };
    ladder.push(current);
  };

  if (current.environment) push({ environment: false });
  for (const size of QUALITY_LADDER.shadowSteps) if (size < current.shadowMapSize) push({ shadowMapSize: size });
  push({ farDetail: false });
  const floor = QUALITY_LADDER.dprFloor;
  while (current.dpr > floor + 1e-6) push({ dpr: round2(Math.max(floor, current.dpr - QUALITY_LADDER.dprStep)) });
  return ladder;
}

/** First level with far detail off: where a hall over its tier's triangle budget starts. */
export function seedLevel(ladder: readonly LiveQuality[], estimatedTriangles: number, budget: number): number {
  if (estimatedTriangles <= budget) return 0;
  const level = ladder.findIndex((step) => !step.farDetail);
  return level < 0 ? 0 : level;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Frame-time governor with hysteresis. Feed it the duration of every frame rendered during interaction (never idle
 * time: an idle canvas renders nothing and must count neither as fast nor as slow). It answers with a new level when
 * one is due, `null` otherwise. Higher level = cheaper rendering.
 *
 * - Slow: median of the last `sampleWindow` frames above `slowFrameMs` -> one level down at once.
 * - Fast: median below `fastFrameMs` for `raiseAfterMs` of rendered time -> one level up.
 * - Between the two thresholds nothing happens (the dead band), and the fast count starts over.
 * - After any change the window is cleared and `cooldownFrames` frames are skipped.
 * - A raise that turns out too slow within `probationMs` makes the next raise wait `raiseBackoff` times longer.
 */
export class QualityGovernor {
  level: number;
  private readonly tuning: QualityTuning;
  private window: number[] = [];
  private skip = 0;
  private fastMs = 0;
  private raiseAfterMs: number;
  /** Rendered time since the last raise, while that raise is on probation (null: none on probation). */
  private probation: number | null = null;

  constructor(
    readonly maxLevel: number,
    level = 0,
    tuning: Partial<QualityTuning> = {},
  ) {
    this.tuning = { ...QUALITY_TUNING, ...tuning };
    this.level = Math.min(Math.max(0, level), maxLevel);
    this.raiseAfterMs = this.tuning.raiseAfterMs;
  }

  /** Current wait before a raise (grows with failed raises). */
  get raiseDelayMs(): number {
    return this.raiseAfterMs;
  }

  /** One rendered frame. Returns the new level if it changed. */
  sample(frameMs: number): number | null {
    if (!(frameMs > 0)) return null;
    const t = this.tuning;
    const ms = Math.min(frameMs, t.maxSampleMs);

    if (this.probation !== null) {
      this.probation += ms;
      if (this.probation >= t.probationMs) {
        // The raise held: the next one waits the normal time again.
        this.probation = null;
        this.raiseAfterMs = t.raiseAfterMs;
      }
    }
    if (this.skip > 0) {
      this.skip--;
      return null;
    }

    this.window.push(ms);
    if (this.window.length > t.sampleWindow) this.window.shift();
    if (this.window.length < t.sampleWindow) return null;

    const typical = median(this.window);
    if (typical > t.slowFrameMs) {
      this.fastMs = 0;
      if (this.level >= this.maxLevel) return null;
      if (this.probation !== null) this.raiseAfterMs = Math.min(t.maxRaiseAfterMs, this.raiseAfterMs * t.raiseBackoff);
      this.probation = null;
      return this.change(this.level + 1);
    }
    if (typical < t.fastFrameMs) {
      this.fastMs += ms;
      if (this.level > 0 && this.fastMs >= this.raiseAfterMs) {
        this.probation = 0;
        return this.change(this.level - 1);
      }
      return null;
    }
    this.fastMs = 0;
    return null;
  }

  /** Forget the current trend (an offscreen render, a mode switch). The level stays. */
  pause(): void {
    this.window = [];
    this.fastMs = 0;
  }

  /** Jump to a level (the hall-cost seed); counts as a change. */
  setLevel(level: number): void {
    this.change(Math.min(Math.max(0, level), this.maxLevel));
  }

  private change(level: number): number {
    this.level = level;
    this.window = [];
    this.fastMs = 0;
    this.skip = this.tuning.cooldownFrames;
    return level;
  }
}
