'use client';

/**
 * Status line at the top of the 3D view while an opening tool is active (T1b): what is being placed and how to stop.
 * Desktop: "Plasezi: Fereastră · click pe perete · Esc pentru a termina". Phones / touch: a bar with a "Gata" button.
 * Also binds Esc to end the tool (ignored while typing in a field, like the view keys).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import type { OpeningType } from '@/stores/useOpeningsStore';

export const PLACING_LABEL: Record<OpeningType, string> = {
  window: 'Fereastră',
  door: 'Ușă',
  garageDoor: 'Ușă industrială',
};

/** Same rule as the view keys (ViewToolbar): shortcuts never fire while the user types in a field. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

const TOUCH_QUERY = '(pointer: coarse), (max-width: 767px)';

function subscribeTouch(onChange: () => void): () => void {
  try {
    const mq = window.matchMedia(TOUCH_QUERY);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  } catch {
    return () => {};
  }
}

function touchSnapshot(): boolean {
  try {
    return window.matchMedia(TOUCH_QUERY).matches;
  } catch {
    return false;
  }
}

/** Phones and touch screens (coarse pointer or narrower than 768 px). False on the server. */
export function useTouchLayout(): boolean {
  return useSyncExternalStore(subscribeTouch, touchSnapshot, () => false);
}

/** Ends the active tool on Esc. */
function usePlacementEscape(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTyping(e.target)) return;
      useOpeningsStore.getState().setActiveTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

export default function PlacementStatus() {
  const activeTool = useOpeningsStore((s) => s.activeTool);
  const setActiveTool = useOpeningsStore((s) => s.setActiveTool);
  const touch = useTouchLayout();
  usePlacementEscape(activeTool !== null);

  if (!activeTool) return null;
  const label = PLACING_LABEL[activeTool];

  if (touch) {
    return (
      <div
        role="status"
        className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-3 bg-gray-950/90 backdrop-blur-md text-white rounded-xl shadow-lg pl-4 pr-1.5 py-1.5 text-xs font-semibold"
      >
        <span className="min-w-0 truncate">
          Plasezi: {label} · atinge o travee
        </span>
        <button
          type="button"
          onClick={() => setActiveTool(null)}
          className="shrink-0 rounded-lg bg-[var(--color-primary)] text-[var(--ui-accent-text)] px-4 py-2 font-bold cursor-pointer"
        >
          Gata
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-24px)] whitespace-nowrap overflow-hidden text-ellipsis bg-gray-950/90 backdrop-blur-md text-white rounded-xl shadow-lg px-4 py-2 text-xs font-semibold pointer-events-none"
    >
      Plasezi: {label} · click pe perete · <kbd className="font-sans font-bold">Esc</kbd> pentru a termina
    </div>
  );
}
