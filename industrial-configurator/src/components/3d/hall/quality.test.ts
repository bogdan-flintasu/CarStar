import { describe, expect, it } from 'vitest';
import { QUALITY_TUNING, QualityGovernor, TRIANGLE_BUDGET, qualityLadder, seedLevel } from './quality';

const ULTRA = { enableEnvironment: true, shadowMapSize: 2048, dpr: [2, 2] as const };
const LOW = { enableEnvironment: false, shadowMapSize: 512, dpr: [1, 1.25] as const };

/** Feeds `count` frames of `ms`; returns the levels the governor moved to. */
function feed(governor: QualityGovernor, ms: number, count: number): number[] {
  const changes: number[] = [];
  for (let i = 0; i < count; i++) {
    const level = governor.sample(ms);
    if (level !== null) changes.push(level);
  }
  return changes;
}

describe('qualityLadder', () => {
  it('lowers environment, then shadows, then far detail, then DPR down to 1', () => {
    const ladder = qualityLadder(ULTRA, 2);
    expect(ladder[0]).toEqual({ environment: true, shadowMapSize: 2048, farDetail: true, dpr: 2 });
    expect(ladder.map((q) => [q.environment, q.shadowMapSize, q.farDetail, q.dpr])).toEqual([
      [true, 2048, true, 2],
      [false, 2048, true, 2],
      [false, 1024, true, 2],
      [false, 512, true, 2],
      [false, 512, false, 2],
      [false, 512, false, 1.75],
      [false, 512, false, 1.5],
      [false, 512, false, 1.25],
      [false, 512, false, 1],
    ]);
  });

  it('level 0 is the tier: DPR clamped to its range', () => {
    expect(qualityLadder({ ...ULTRA, dpr: [1.5, 2] }, 3)[0].dpr).toBe(2);
    expect(qualityLadder({ ...ULTRA, dpr: [1.5, 2] }, 1)[0].dpr).toBe(1.5);
  });

  it('leaves out steps that change nothing on a low tier', () => {
    const ladder = qualityLadder(LOW, 1);
    expect(ladder).toEqual([
      { environment: false, shadowMapSize: 512, farDetail: true, dpr: 1 },
      { environment: false, shadowMapSize: 512, farDetail: false, dpr: 1 },
    ]);
  });

  it('never goes below DPR 1', () => {
    const ladder = qualityLadder({ ...LOW, dpr: [1.25, 1.25] }, 2);
    expect(ladder.at(-1)!.dpr).toBe(1);
    expect(Math.min(...ladder.map((q) => q.dpr))).toBe(1);
  });
});

describe('seedLevel', () => {
  const ladder = qualityLadder(ULTRA, 2);
  it('starts a hall over budget at the first level without far detail', () => {
    expect(seedLevel(ladder, 300_000, TRIANGLE_BUDGET.medium)).toBe(4);
    expect(ladder[4].farDetail).toBe(false);
  });
  it('keeps level 0 within budget, and on high tiers whatever the hall', () => {
    expect(seedLevel(ladder, 100_000, TRIANGLE_BUDGET.medium)).toBe(0);
    expect(seedLevel(ladder, 10_000_000, TRIANGLE_BUDGET.ultra)).toBe(0);
  });
});

describe('QualityGovernor', () => {
  const { sampleWindow, cooldownFrames, raiseAfterMs } = QUALITY_TUNING;

  it('does nothing until a full window of frames was rendered', () => {
    const governor = new QualityGovernor(8);
    expect(feed(governor, 50, sampleWindow - 1)).toEqual([]);
    expect(feed(governor, 50, 1)).toEqual([1]);
  });

  it('lowers one level per slow window, with a cooldown between steps', () => {
    const governor = new QualityGovernor(8);
    expect(feed(governor, 50, sampleWindow)).toEqual([1]);
    // During the cooldown and while the window refills, nothing moves.
    expect(feed(governor, 50, cooldownFrames + sampleWindow - 1)).toEqual([]);
    expect(feed(governor, 50, 1)).toEqual([2]);
  });

  it('stops at the last level', () => {
    const governor = new QualityGovernor(2, 2);
    expect(feed(governor, 100, 200)).toEqual([]);
    expect(governor.level).toBe(2);
  });

  it('holds still in the dead band between fast and slow', () => {
    const governor = new QualityGovernor(8, 3);
    expect(feed(governor, 24, 500)).toEqual([]);
  });

  it('raises one level after sustained fast frames, never above level 0', () => {
    const governor = new QualityGovernor(8, 1);
    const framesToRaise = Math.ceil(raiseAfterMs / 16.7);
    expect(feed(governor, 16.7, sampleWindow + framesToRaise)).toEqual([0]);
    expect(feed(governor, 16.7, 2000)).toEqual([]);
  });

  it('ignores a single hitch (median, not mean)', () => {
    const governor = new QualityGovernor(8);
    feed(governor, 16.7, sampleWindow - 1);
    expect(governor.sample(400)).toBeNull();
    expect(feed(governor, 16.7, 50)).toEqual([]);
  });

  it('ignores non-frames (zero, negative, NaN)', () => {
    const governor = new QualityGovernor(8);
    for (const ms of [0, -5, Number.NaN]) expect(governor.sample(ms)).toBeNull();
    expect(feed(governor, 50, sampleWindow - 1)).toEqual([]);
  });

  it('pause forgets the trend: half a slow window, a pause, half again -> no change', () => {
    const governor = new QualityGovernor(8);
    feed(governor, 50, sampleWindow - 2);
    governor.pause();
    expect(feed(governor, 50, sampleWindow - 2)).toEqual([]);
  });

  it('backs off a raise that turned out too slow (no oscillation)', () => {
    const governor = new QualityGovernor(8, 1);
    const fastFrames = sampleWindow + Math.ceil(raiseAfterMs / 16.7);
    expect(feed(governor, 16.7, fastFrames)).toEqual([0]);
    // Level 0 is too slow: back down, and the next raise waits twice as long.
    expect(feed(governor, 40, cooldownFrames + sampleWindow)).toEqual([1]);
    expect(governor.raiseDelayMs).toBe(raiseAfterMs * QUALITY_TUNING.raiseBackoff);
    expect(feed(governor, 16.7, cooldownFrames + fastFrames)).toEqual([]);
    expect(feed(governor, 16.7, Math.ceil(raiseAfterMs / 16.7) + 1)).toEqual([0]);
  });

  it('a raise that holds through its probation resets the wait', () => {
    const governor = new QualityGovernor(8, 2, { raiseBackoff: 2 });
    const fastFrames = sampleWindow + Math.ceil(raiseAfterMs / 16.7);
    feed(governor, 16.7, fastFrames); // -> 1
    feed(governor, 40, cooldownFrames + sampleWindow); // -> 2, backoff
    expect(governor.raiseDelayMs).toBeGreaterThan(raiseAfterMs);
    feed(governor, 16.7, cooldownFrames + sampleWindow + Math.ceil((2 * raiseAfterMs) / 16.7) + 1); // -> 1
    expect(governor.level).toBe(1);
    feed(governor, 16.7, Math.ceil(QUALITY_TUNING.probationMs / 16.7) + 1);
    expect(governor.raiseDelayMs).toBe(raiseAfterMs);
  });

  it('setLevel clamps and counts as a change', () => {
    const governor = new QualityGovernor(4);
    governor.setLevel(9);
    expect(governor.level).toBe(4);
    governor.setLevel(-1);
    expect(governor.level).toBe(0);
  });
});
