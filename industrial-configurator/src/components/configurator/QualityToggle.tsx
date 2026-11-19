'use client';

/**
 * "Calitate: Auto / Ridicată" over the 3D view. Auto lets the live view lower its quality while frames are slow
 * (qualityController.tsx); Ridicată keeps the device's own settings. Per-browser choice (localStorage).
 * Sits next to the undo/redo buttons on desktop (right of them, above the "Control 3D" legend) and above them on
 * phones, clear of the view toolbar and the admin bar.
 */
import { useEffect } from 'react';
import { loadSavedQualityMode, useQualityStore, type QualityMode } from '@/components/3d/hall/qualityStore';

const OPTIONS: { mode: QualityMode; label: string; title: string }[] = [
  { mode: 'auto', label: 'Auto', title: 'Calitatea se reduce automat dacă imaginea se mișcă greu' },
  { mode: 'high', label: 'Ridicată', title: 'Calitatea maximă a acestui dispozitiv, fără reducere' },
];

export default function QualityToggle() {
  const mode = useQualityStore((s) => s.mode);
  const reduced = useQualityStore((s) => s.mode === 'auto' && s.level > 0);
  const setMode = useQualityStore((s) => s.setMode);

  useEffect(loadSavedQualityMode, []);

  return (
    <div
      role="group"
      aria-label="Calitate grafică"
      className="absolute bottom-[114px] left-3 md:bottom-[112px] md:left-[116px] z-20 flex items-center gap-0.5 p-1 bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm"
    >
      <span className="pl-1 pr-0.5 md:pl-1.5 md:pr-1 text-[9px] md:text-[10px] font-bold text-gray-500 uppercase tracking-wider select-none">Calitate</span>
      {OPTIONS.map((option) => {
        const active = option.mode === mode;
        return (
          <button
            key={option.mode}
            type="button"
            aria-pressed={active}
            title={option.mode === 'auto' && reduced ? 'Calitate redusă acum, pentru o mișcare fluidă' : option.title}
            onClick={() => setMode(option.mode)}
            className={`relative h-7 md:h-9 px-2 md:px-2.5 rounded-lg text-[11px] md:text-xs font-semibold transition-colors cursor-pointer ${
              active ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {option.label}
            {option.mode === 'auto' && reduced && (
              <span aria-hidden className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}
