'use client';

import { motion } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';

export default function PanelsStep() {
  const {
    showFoundation, setShowFoundation,
    hasSandwichPanels, setHasSandwichPanels,
    isIsolated, setIsIsolated,
    insulation, setInsulation,
    nextStep, prevStep,
  } = useConfiguratorStore();

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
        <h3 className="text-sm font-bold text-black uppercase mb-1">Structură</h3>
      </div>

      <div className="space-y-8 flex-1 overflow-y-auto pr-2 pb-8">
        {/* Foundation Options */}
        <div>
          <div className="mb-3">
            <span className="text-sm font-bold text-black block">Fundație de Beton</span>
            <span className="text-xs text-gray-500">Bază din beton armat pentru structură</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowFoundation(true)}
              className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                showFoundation 
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-[0_0_15px_rgba(245,166,35,0.1)]' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="block font-bold text-black text-sm mb-1">Da</span>
              <span className="block text-xs text-gray-500 leading-tight">Include fundația</span>
            </button>
            <button
              onClick={() => setShowFoundation(false)}
              className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                !showFoundation 
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-[0_0_15px_rgba(245,166,35,0.1)]' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="block font-bold text-black text-sm mb-1">Nu</span>
              <span className="block text-xs text-gray-500 leading-tight">Fără fundație</span>
            </button>
          </div>
        </div>

        {/* Sandwich Panels / Insulation Options */}
        <div>
          <div className="mb-3">
            <span className="text-sm font-bold text-black block">Panouri Sandwich</span>
            <span className="text-xs text-gray-500">Panouri termoizolante pentru pereți</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setHasSandwichPanels(true);
                setIsIsolated(true);
              }}
              className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                hasSandwichPanels 
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-[0_0_15px_rgba(245,166,35,0.1)]' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="block font-bold text-black text-sm mb-1">Da</span>
              <span className="block text-xs text-gray-500 leading-tight">Adaugă panouri</span>
            </button>
            <button
              onClick={() => {
                setHasSandwichPanels(false);
                setIsIsolated(false);
              }}
              className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                !hasSandwichPanels 
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-[0_0_15px_rgba(245,166,35,0.1)]' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="block font-bold text-black text-sm mb-1">Nu</span>
              <span className="block text-xs text-gray-500 leading-tight">Doar structura</span>
            </button>
          </div>

          {/* Insulation thickness slider (conditional) */}
          {hasSandwichPanels && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 rounded-xl border border-gray-200 bg-gray-50"
            >
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-bold text-gray-800">Grosime</label>
                <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-1">
                  <input
                    type="number"
                    value={insulation}
                    min={30}
                    max={250}
                    step={10}
                    className="w-12 text-right outline-none text-black font-bold"
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setInsulation(Math.max(30, Math.min(250, v)));
                    }}
                  />
                  <span className="text-gray-500 ml-1 font-medium">mm</span>
                </div>
              </div>
              <input
                type="range"
                min={30}
                max={250}
                step={10}
                value={insulation}
                className="w-full cursor-pointer"
                style={{ '--range-progress': `${((insulation - 30) / 220) * 100}%` } as React.CSSProperties}
                onChange={(e) => setInsulation(parseInt(e.target.value, 10))}
              />
            </motion.div>
          )}
        </div>

      </div>
    </motion.div>
  );
}
