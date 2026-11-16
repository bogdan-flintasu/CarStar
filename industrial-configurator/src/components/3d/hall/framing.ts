'use client';

/**
 * Lets UI outside the canvas ask the camera to frame the hall again (the "Reconfigurează" button, a loaded
 * configuration). CameraRig frames whenever the request count changes; it never frames on ordinary slider moves.
 */
import { useSyncExternalStore } from 'react';

let requests = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestHallFraming(): void {
  requests += 1;
  listeners.forEach((listener) => listener());
}

/** A number that changes every time framing is requested: pass it to `<CameraRig frameKey>`. */
export function useHallFramingRequests(): number {
  return useSyncExternalStore(
    subscribe,
    () => requests,
    () => 0,
  );
}
