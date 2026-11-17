'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { HALL_LIMITS } from '@/lib/hall';

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
 * Values are snapped to `step` and out-of-range values are clamped
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
    const v = Math.max(min, Math.min(max, parsed));
    const clamped = v !== parsed;
    if (clamped) setNotice(`Valoarea trebuie să fie între ${min} și ${max} m.`);
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
            className="w-14 text-right outline-none text-black font-medium"
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

const optionCard = (selected: boolean) =>
  `p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
    selected
      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-[0_0_15px_rgba(245,166,35,0.1)]'
      : 'border-gray-200 bg-white hover:border-gray-300'
  }`;

/** Small section drawings of the two roof types (the high side follows the choice). */
function RoofIcon({ mono, highSide = 'right' }: { mono: boolean; highSide?: 'left' | 'right' }) {
  const roof = mono ? (highSide === 'right' ? '2,14 30,6' : '2,6 30,14') : '2,12 16,4 30,12';
  const [lTop, rTop] = mono ? (highSide === 'right' ? [14, 6] : [6, 14]) : [12, 12];
  return (
    <svg viewBox="0 0 32 24" className="w-8 h-6 mb-1 text-gray-700" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <polyline points={roof} strokeLinejoin="round" />
      <line x1={4} y1={lTop} x2={4} y2={22} />
      <line x1={28} y1={rTop} x2={28} y2={22} />
      <line x1={1} y1={22} x2={31} y2={22} />
    </svg>
  );
}

function RoofTypeField() {
  const { roofType, setRoofType, highSide, setHighSide } = useConfiguratorStore(
    useShallow((s) => ({ roofType: s.roofType, setRoofType: s.setRoofType, highSide: s.highSide, setHighSide: s.setHighSide })),
  );
  const mono = roofType === 'mono';
  return (
    <div className="pt-4 border-t border-gray-100">
      <span className="text-sm font-bold text-black block mb-1">Acoperiș</span>
      <span className="text-xs text-gray-500 block mb-3">
        {mono ? 'O singură pantă: o latură e mai înaltă, cealaltă rămâne la înălțimea aleasă.' : 'Două pante, cu coama la mijloc.'}
      </span>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" aria-pressed={!mono} onClick={() => setRoofType('gable')} className={optionCard(!mono)}>
          <RoofIcon mono={false} />
          <span className="block font-bold text-black text-sm">2 ape</span>
        </button>
        <button type="button" aria-pressed={mono} onClick={() => setRoofType('mono')} className={optionCard(mono)}>
          <RoofIcon mono highSide={highSide} />
          <span className="block font-bold text-black text-sm">O apă</span>
        </button>
      </div>
      {mono && (
        <div className="mt-3">
          <span className="text-xs font-semibold text-gray-600 block mb-2">Latura înaltă</span>
          <div className="grid grid-cols-2 gap-3">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={highSide === side}
                onClick={() => setHighSide(side)}
                className={optionCard(highSide === side)}
              >
                <span className="block font-bold text-black text-sm">{side === 'left' ? 'Stânga' : 'Dreapta'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DimensionsStep() {
  const {
    height, setHeight,
    width, setWidth,
    length, setLength,
    wallsVisible, setWallsVisible,
    getFloorArea, roofType,
  } = useConfiguratorStore(useShallow((s) => ({
    roofType: s.roofType,
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
      className="flex flex-col"
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-black uppercase mb-1">Dimensiuni</h3>
      </div>

      {/* Sliders */}
      <div className="space-y-5 flex-1">
        <DimensionField label="Lungime" value={length} min={HALL_LIMITS.length.min} max={HALL_LIMITS.length.max} step={1} onCommit={setLength} first />
        <DimensionField label="Lățime" value={width} min={HALL_LIMITS.width.min} max={HALL_LIMITS.width.max} step={1} onCommit={setWidth} />
        <DimensionField label={roofType === 'mono' ? 'Înălțime (latura joasă)' : 'Înălțime'} value={height} min={HALL_LIMITS.height.min} max={HALL_LIMITS.height.max} step={1} onCommit={setHeight} />
        <RoofTypeField />
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
