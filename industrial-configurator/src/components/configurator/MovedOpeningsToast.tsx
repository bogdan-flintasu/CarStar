'use client';

import { useEffect } from 'react';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { useHistoryStore } from '@/stores/useHistoryStore';

export const TOAST_MS = 6000;

const goluri = (n: number) => (n === 1 ? '1 gol' : `${n} goluri`);

/** Toast text for a relayout notice, e.g. "2 goluri au fost mutate · 1 gol nu mai încape". */
export function relayoutMessage(moved: number, unfit: number): string {
  const parts: string[] = [];
  if (moved > 0) parts.push(`${goluri(moved)} ${moved === 1 ? 'a fost mutat' : 'au fost mutate'}`);
  if (unfit > 0) parts.push(`${goluri(unfit)} nu mai ${unfit === 1 ? 'încape' : 'încap'}`);
  return parts.join(' · ');
}

/** After a change of the hall moved openings or left some that no longer fit: "N goluri au fost mutate · Anulează". */
export default function MovedOpeningsToast() {
  const notice = useOpeningsStore((s) => s.relayoutNotice);
  const dismiss = useOpeningsStore((s) => s.dismissRelayoutNotice);
  const undo = useHistoryStore((s) => s.undo);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, TOAST_MS);
    return () => clearTimeout(t);
  }, [notice, dismiss]);

  if (!notice) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-[112px] md:bottom-6 inset-x-3 mx-auto w-fit z-30 max-w-full flex items-center gap-3 bg-gray-950/90 backdrop-blur-md text-white text-xs font-semibold rounded-xl shadow-lg pl-4 pr-1.5 py-1.5"
    >
      <span className="min-w-0">{relayoutMessage(notice.moved, notice.unfit)}</span>
      <button
        type="button"
        onClick={() => {
          dismiss();
          undo();
        }}
        className="shrink-0 px-3 py-1.5 rounded-lg font-bold text-[var(--color-primary)] hover:bg-white/10 cursor-pointer"
      >
        Anulează
      </button>
    </div>
  );
}
