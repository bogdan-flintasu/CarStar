'use client';

import { motion } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import type { OpeningType } from '@/stores/useOpeningsStore';

// ─── Custom SVG Icons ─────────────────────────────────────────────────────────
function WindowIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="26" height="24" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <line x1="16" y1="4" x2="16" y2="28" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="1.4" />
      {/* Glass reflection lines */}
      <line x1="6" y1="7" x2="8" y2="9" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="19" y1="7" x2="21" y2="9" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="6" y1="19" x2="8" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="19" y1="19" x2="21" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

function DoorIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="3" width="20" height="26" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      {/* Panel detail */}
      <rect x="9" y="6" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <rect x="9" y="18" width="14" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      {/* Door handle */}
      <circle cx="22" cy="17" r="1.3" stroke="currentColor" strokeWidth="1.2" />
      {/* Floor line */}
      <line x1="3" y1="29" x2="29" y2="29" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function GarageDoorIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Frame */}
      <path d="M3 28V5a2 2 0 012-2h22a2 2 0 012 2v23" stroke="currentColor" strokeWidth="1.8" />
      {/* Horizontal panel sections */}
      <line x1="5" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="13" x2="27" y2="13" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="18" x2="27" y2="18" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="23" x2="27" y2="23" stroke="currentColor" strokeWidth="1.2" />
      {/* Floor */}
      <line x1="1" y1="28" x2="31" y2="28" stroke="currentColor" strokeWidth="1.8" />
      {/* Small window panels at top */}
      <rect x="7" y="4.5" width="4" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <rect x="14" y="4.5" width="4" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <rect x="21" y="4.5" width="4" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}

const ICON_MAP: Record<OpeningType, React.FC<{ className?: string }>> = {
  window: WindowIcon,
  door: DoorIcon,
  garageDoor: GarageDoorIcon,
};

const LABEL_MAP: Record<OpeningType, string> = {
  window: 'Fereastră',
  door: 'Ușă',
  garageDoor: 'Ușă Industrială',
};

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

  const tools: { type: OpeningType; label: string }[] = [
    { type: 'window', label: 'Geamuri' },
    { type: 'door', label: 'Uși' },
    { type: 'garageDoor', label: 'Uși industriale' },
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
        <h3 className="text-sm font-bold text-black uppercase mb-1">Ferestre și Uși</h3>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto">
        {/* Tool buttons */}
        <div className="flex gap-2">
          {tools.map((tool) => {
            const Icon = ICON_MAP[tool.type];
            return (
              <button
                key={tool.type}
                onClick={() => handleToolClick(tool.type)}
                className={`flex-1 flex flex-col items-center gap-2 py-3.5 px-2 rounded-xl border-2 transition-all duration-200 cursor-pointer
                  ${activeTool === tool.type
                    ? 'bg-orange-50 border-[var(--color-primary)] text-[var(--color-primary)] shadow-md'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
              >
                <Icon className="w-7 h-7" />
                <span className="text-xs font-bold">{tool.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active tool hint */}
        {activeTool && (
          <p className="text-xs text-gray-500 text-center animate-pulse">
            Apasă pe un perete și apoi pe{' '}
            <span className="text-[var(--color-primary)] font-bold">+</span> pentru a adăuga
          </p>
        )}

        {/* Openings summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center shadow-sm">
            <div className="flex justify-center mb-1 text-gray-400">
              <WindowIcon className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-black">{windowCount}</div>
            <div className="text-xs text-gray-500 font-medium">Geamuri</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center shadow-sm">
            <div className="flex justify-center mb-1 text-gray-400">
              <DoorIcon className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-black">{doorCount}</div>
            <div className="text-xs text-gray-500 font-medium">Uși</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center shadow-sm">
            <div className="flex justify-center mb-1 text-gray-400">
              <GarageDoorIcon className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-black">{garageDoorCount}</div>
            <div className="text-xs text-gray-500 font-medium">Industriale</div>
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
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = ICON_MAP[selectedOpening.type];
                  return <Icon className="w-5 h-5 text-[var(--color-primary)]" />;
                })()}
                <span className="text-sm font-bold text-black">
                  {LABEL_MAP[selectedOpening.type]}
                </span>
              </div>
              <button
                onClick={() => {
                  removeOpening(selectedOpening.id);
                  selectOpening(null);
                }}
                className="text-red-500 hover:text-red-700 text-sm font-bold cursor-pointer transition-colors px-2 py-1 rounded hover:bg-red-50"
              >
                Șterge
              </button>
            </div>

            {/* Width */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Lățime</span>
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
              <span className="text-sm font-bold text-gray-800">Înălțime</span>
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
              Perete: {selectedOpening.wallId.replace('PereteFata', 'Față').replace('PereteSpate', 'Spate').replace('PereteSTG', 'Stânga').replace('PereteDR', 'Dreapta')}
            </div>
          </motion.div>
        )}

        {/* Openings list */}
        {openings.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
              Lista de Deschideri
            </span>
            {openings.map((o) => {
              const Icon = ICON_MAP[o.type];
              return (
                <button
                  key={o.id}
                  onClick={() => selectOpening(o.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                    selectedOpeningId === o.id
                      ? 'bg-orange-50 border-2 border-[var(--color-primary)] text-black'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${selectedOpeningId === o.id ? 'text-[var(--color-primary)]' : 'text-gray-400'}`} />
                    <span className="text-xs font-bold">
                      {o.width.toFixed(1)} × {o.height.toFixed(1)}m
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    {o.wallId.replace('PereteFata', 'Față').replace('PereteSpate', 'Spate').replace('PereteSTG', 'Stânga').replace('PereteDR', 'Dreapta')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

    </motion.div>
  );
}
