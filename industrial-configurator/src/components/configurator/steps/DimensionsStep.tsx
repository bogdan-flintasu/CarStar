'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';

interface DimensionFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  first?: boolean;
}

/**
 * Slider + number input. The input keeps a local draft string while typing and only
 * validates/clamps on blur or Enter, so multi-digit values can be typed.
 * Values are snapped to `step` (length: 6 m bay grid) and out-of-range values are clamped
 * with an inline notice.
 */
function DimensionField({ label, value, min, max, step, onCommit, first }: DimensionFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const commit = () => {
    if (draft === null) return;
    const parsed = parseInt(draft, 10);
    setDraft(null);
    if (isNaN(parsed)) {
      setNotice(`Introduceți o valoare între ${min} și ${max} m.`);
      return;
    }
    let v = Math.max(min, Math.min(max, parsed));
    const clamped = v !== parsed;
    if (step > 1) v = min + Math.round((v - min) / step) * step;
    if (clamped) setNotice(`Valoarea trebuie să fie între ${min} și ${max} m.`);
    else if (v !== parsed) setNotice(`Lungimea se rotunjește la multiplu de ${step} m (${v} m).`);
    else setNotice('');
    onCommit(v);
  };

  return (
    <div className={first ? '' : 'pt-4 border-t border-gray-100'}>
      <div className="flex items-center justify-between mb-4">
        <label className="text-sm font-bold text-gray-800">{label}</label>
        <div className={`flex items-center border rounded-lg px-3 py-1 ${notice ? 'border-red-400' : 'border-gray-300'}`}>
          <input
            type="number"
            inputMode="numeric"
            value={draft ?? value}
            min={min}
            max={max}
            step={step}
            aria-label={label}
            aria-invalid={!!notice}
            className="w-12 text-right outline-none text-black font-medium"
            onChange={(e) => { setDraft(e.target.value); setNotice(''); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          />
          <span className="text-gray-500 ml-1">m</span>
        </div>
      </div>
      {notice && <p role="alert" className="text-xs text-red-500 -mt-2 mb-3">{notice}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        className="w-full cursor-pointer"
        style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => { setNotice(''); setDraft(null); onCommit(parseInt(e.target.value, 10)); }}
      />
    </div>
  );
}

export default function DimensionsStep() {
  const {
    height, setHeight,
    width, setWidth,
    length, setLength,
    wallsVisible, setWallsVisible,
    getFloorArea,
  } = useConfiguratorStore(useShallow((s) => ({
    height: s.height, setHeight: s.setHeight,
    width: s.width, setWidth: s.setWidth,
    length: s.length, setLength: s.setLength,
    wallsVisible: s.wallsVisible, setWallsVisible: s.setWallsVisible,
    getFloorArea: s.getFloorArea,
  })));

  const floorArea = getFloorArea();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-black uppercase mb-1">Dimensiuni</h3>
      </div>

      {/* Sliders */}
      <div className="space-y-5 flex-1">
        <DimensionField label="Lungime" value={length} min={12} max={102} step={6} onCommit={setLength} first />
        <DimensionField label="Lățime" value={width} min={8} max={20} step={1} onCommit={setWidth} />
        <DimensionField label="Înălțime" value={height} min={3} max={6} step={1} onCommit={setHeight} />
        {/* Computed values */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-100 mb-6">
          <span className="text-sm font-bold text-gray-800">Suprafață utilă</span>
          <span className="text-sm font-bold text-black">{floorArea} m²</span>
        </div>

        {/* Remove walls toggle */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div>
            <span className="text-sm font-bold text-gray-800 block">
              Ascunde pereții
            </span>
            <span className="text-xs text-gray-500">
              Afișează cotele dimensionale
            </span>
          </div>
          <button
            onClick={() => setWallsVisible(!wallsVisible)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 cursor-pointer ${
              !wallsVisible ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                !wallsVisible ? 'translate-x-6' : 'translate-x-1'
              } shadow-sm`}
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
