'use client';

/**
 * T1d: Ctrl/⌘+C copies the selected opening (and starts paste mode), Ctrl/⌘+V pastes a copy into the next free bay,
 * Ctrl/⌘+D duplicates. Ignored while typing in a field; copy yields to the browser while text is selected.
 */
import { useEffect } from 'react';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { isMacPlatform, shortcutFor } from '@/components/3d/openings/shortcuts';

export function useOpeningsShortcuts() {
  useEffect(() => {
    const isMac = isMacPlatform(typeof navigator === 'undefined' ? undefined : navigator);
    const onKey = (e: KeyboardEvent) => {
      const s = useOpeningsStore.getState();
      let textSelected = false;
      try {
        const sel = window.getSelection();
        textSelected = !!sel && !sel.isCollapsed && sel.toString().length > 0;
      } catch {
        // No selection API: treat as none.
      }
      const action = shortcutFor(e, {
        isMac,
        hasSelection: s.selectedOpeningId !== null && s.openings.some((o) => o.id === s.selectedOpeningId),
        hasClipboard: s.clipboard !== null,
        textSelected,
      });
      if (!action) return;
      e.preventDefault();
      if (action === 'copy' && s.selectedOpeningId) s.copyOpening(s.selectedOpeningId);
      else if (action === 'paste') s.pasteOpening();
      else if (action === 'duplicate' && s.selectedOpeningId) s.duplicateOpening(s.selectedOpeningId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Mount point for the shortcuts (renders nothing). */
export default function OpeningsShortcuts() {
  useOpeningsShortcuts();
  return null;
}
