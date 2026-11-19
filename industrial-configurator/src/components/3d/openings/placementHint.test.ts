import { beforeEach, describe, expect, it } from 'vitest';
import {
  isPlacementHintSeen,
  markPlacementHintSeen,
  PLACEMENT_HINT_KEY,
  resetPlacementHintForTests,
  subscribePlacementHint,
} from './placementHint';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('first-time placement hint flag', () => {
  beforeEach(() => resetPlacementHintForTests());

  it('is unseen at first and seen after the first placement, across visits', () => {
    const storage = memory();
    expect(isPlacementHintSeen(storage)).toBe(false);
    markPlacementHintSeen(storage);
    expect(storage.getItem(PLACEMENT_HINT_KEY)).toBe('1');
    resetPlacementHintForTests(); // a later visit
    expect(isPlacementHintSeen(storage)).toBe(true);
  });

  it('survives a throwing localStorage: shown, then hidden for this page', () => {
    expect(isPlacementHintSeen(throwing)).toBe(false);
    expect(() => markPlacementHintSeen(throwing)).not.toThrow();
    expect(isPlacementHintSeen(throwing)).toBe(true);
  });

  it('works without any storage and notifies subscribers once', () => {
    let calls = 0;
    const off = subscribePlacementHint(() => calls++);
    markPlacementHintSeen(null);
    markPlacementHintSeen(null);
    off();
    expect(calls).toBe(1);
    expect(isPlacementHintSeen(null)).toBe(true);
  });
});
