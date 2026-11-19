// The first-time placement hint (T1b): shown in the openings panel until the user has placed an opening once in this
// browser. The flag lives in localStorage; every access is wrapped, so private windows and blocked storage just show
// the hint again (never an error).

export const PLACEMENT_HINT_KEY = 'carstar-placement-hint-seen';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const listeners = new Set<() => void>();
/** Remembered for this page even when storage refuses the write. */
let seenThisPage = false;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** True once the user has placed an opening in this browser. */
export function isPlacementHintSeen(storage: StorageLike | null = defaultStorage()): boolean {
  if (seenThisPage) return true;
  try {
    return storage?.getItem(PLACEMENT_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Hides the hint from now on (and in later visits, when storage allows it). */
export function markPlacementHintSeen(storage: StorageLike | null = defaultStorage()): void {
  if (!seenThisPage) {
    seenThisPage = true;
    listeners.forEach((l) => l());
  }
  try {
    storage?.setItem(PLACEMENT_HINT_KEY, '1');
  } catch {
    // Storage full or blocked: the hint stays hidden for this page only.
  }
}

/** For `useSyncExternalStore`. */
export function subscribePlacementHint(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests only: forget the in-page flag. */
export function resetPlacementHintForTests(): void {
  seenThisPage = false;
}
