'use client';

import { motion } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import type { OpeningType } from '@/stores/useOpeningsStore';

export default function ClosingsStep() {
  const { nextStep, prevStep } = useConfiguratorStore();

  const activeTool = useOpeningsStore((s) => s.activeTool);
  const setActiveTool = useOpeningsStore((s) => s.setActiveTool);
  const selectedOpeningId = useOpeningsStore((s) => s.selectedOpeningId);
  const openings = useOpeningsStore((s) => s.openings);
  const updateOpening = useOpeningsStore((s) => s.updateOpening);
  const removeOpening = useOpeningsStore((s) => s.removeOpening);
  const selectOpening = useOpeningsStore((s) => s.selectOpening);

  const selectedOpening = openings.find((o) => o.id === selectedOpeningId) || null;

  const tools: { type: OpeningType; label: string; icon: string }[] = [
    { type: 'window', label: 'Geamuri', icon: '🪟' },
    { type: 'door', label: 'Uși', icon: '🚪' },
    { type: 'garageDoor', label: 'Uși industriale', icon: '🏗️' },
  ];

  const handleToolClick = (tool: OpeningType) => {
    setActiveTool(activeTool === tool ? null : tool);
  };

  // Count openings by type
  const windowCount = openings.filter((o) => o.type === 'window').length;
  const doorCount = openings.filter((o) => o.type === 'door').length;
  const garageDoorCount = openings.filter((o) => o.type === 'garageDoor').length;

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
        <h3 className="text-sm font-bold text-black uppercase mb-1">Openings</h3>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto">
        {/* Tool buttons */}
        <div className="flex gap-2">
          {tools.map((tool) => (
            <button
              key={tool.type}
              onClick={() => handleToolClick(tool.type)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all duration-200 cursor-pointer
                ${activeTool === tool.type
                  ? 'bg-orange-50 border-[var(--color-primary)] text-[var(--color-primary)] shadow-sm'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
            >
              <span className="text-2xl">{tool.icon}</span>
              <span className="text-xs font-bold">{tool.label}</span>
            </button>
          ))}
        </div>

        {/* Active tool hint */}
        {activeTool && (
          <p className="text-xs text-gray-500 text-center animate-pulse">
            Click on a wall and press{' '}
            <span className="text-[var(--color-primary)] font-bold">+</span> to add
          </p>
        )}

        {/* Openings summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-gray-200 rounded-lg p-2 text-center shadow-sm">
            <div className="text-lg font-bold text-black">{windowCount}</div>
            <div className="text-xs text-gray-500 font-medium">Windows</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2 text-center shadow-sm">
            <div className="text-lg font-bold text-black">{doorCount}</div>
            <div className="text-xs text-gray-500 font-medium">Doors</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2 text-center shadow-sm">
            <div className="text-lg font-bold text-black">{garageDoorCount}</div>
            <div className="text-xs text-gray-500 font-medium">Industrial</div>
          </div>
        </div>

        {/* Selected opening editor */}
        {selectedOpening && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-lg p-4 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-black">
                {selectedOpening.type === 'window' ? '🪟 Window' : selectedOpening.type === 'door' ? '🚪 Door' : '🏗️ Industrial Door'}
              </span>
              <button
                onClick={() => {
                  removeOpening(selectedOpening.id);
                  selectOpening(null);
                }}
                className="text-red-500 hover:text-red-700 text-sm font-bold cursor-pointer transition-colors px-2 py-1 rounded hover:bg-red-50"
              >
                Delete
              </button>
            </div>

            {/* Width */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Width</span>
              <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1 bg-white">
                <input
                  type="number"
                  value={Math.round(selectedOpening.width * 100) / 100}
                  min={0.3}
                  max={20}
                  step={0.1}
                  className="w-12 text-right outline-none text-black font-medium"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.3) updateOpening(selectedOpening.id, { width: val });
                  }}
                />
                <span className="text-gray-500 ml-1">m</span>
              </div>
            </div>

            {/* Height */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Height</span>
              <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1 bg-white">
                <input
                  type="number"
                  value={Math.round(selectedOpening.height * 100) / 100}
                  min={0.3}
                  max={10}
                  step={0.1}
                  className="w-12 text-right outline-none text-black font-medium"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.3) updateOpening(selectedOpening.id, { height: val });
                  }}
                />
                <span className="text-gray-500 ml-1">m</span>
              </div>
            </div>

            {/* Wall info */}
            <div className="text-xs text-gray-500 font-medium pt-3 border-t border-gray-100">
              Wall: {selectedOpening.wallId.replace('Perete', '')}
            </div>
          </motion.div>
        )}

        {/* Openings list */}
        {openings.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
              List of Openings
            </span>
            {openings.map((o) => (
              <button
                key={o.id}
                onClick={() => selectOpening(o.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                  selectedOpeningId === o.id
                    ? 'bg-orange-50 border border-[var(--color-primary)] text-black'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {o.type === 'window' ? '🪟' : o.type === 'door' ? '🚪' : '🏗️'}
                  </span>
                  <span className="text-xs font-bold">
                    {o.width.toFixed(1)} × {o.height.toFixed(1)}m
                  </span>
                </div>
                <span className="text-xs text-gray-400 font-medium">
                  {o.wallId.replace('Perete', '')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

    </motion.div>
  );
}
