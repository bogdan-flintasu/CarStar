'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { startHistoryRecording, useHistoryStore } from '@/stores/useHistoryStore';
import { isTypingTarget } from '@/components/3d/openings/shortcuts';

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const noSubscribe = () => () => {};

/** Records the history and binds Ctrl/⌘+Z (undo), Ctrl/⌘+Shift+Z and Ctrl+Y (redo). Mount once. */
export function useHistoryShortcuts() {
  useEffect(() => startHistoryRecording(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const { undo, redo } = useHistoryStore.getState();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function UndoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 14l5-5-5-5m5 5H9.5a5.5 5.5 0 000 11H13" />
    </svg>
  );
}

/** "Anulează" / "Refă" over the 3D view, on every step. Also records the history and binds the shortcuts. */
export default function HistoryButtons() {
  useHistoryShortcuts();
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  // 'Ctrl' on the server and during hydration, the platform's key afterwards.
  const mod = useSyncExternalStore(noSubscribe, () => (isMac() ? '⌘' : 'Ctrl'), () => 'Ctrl');

  const button =
    'flex items-center justify-center w-9 h-9 rounded-lg text-gray-700 transition-colors cursor-pointer hover:bg-gray-100 disabled:opacity-35 disabled:cursor-default disabled:hover:bg-transparent';

  return (
    <div
      role="toolbar"
      aria-label="Istoric modificări"
      className="absolute bottom-16 left-3 md:bottom-[112px] md:left-6 z-20 flex gap-0.5 p-1 bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm"
    >
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Anulează"
        title={`Anulează (${mod}+Z)`}
        className={button}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Refă"
        title={`Refă (${mod}+Shift+Z)`}
        className={button}
      >
        <RedoIcon />
      </button>
    </div>
  );
}
