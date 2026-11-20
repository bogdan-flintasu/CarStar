'use client';

import ColorPicker from '../ColorPicker';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { useOpeningsStore, MIN_OPENING_SIZE } from '@/stores/useOpeningsStore';
import type { OpeningType } from '@/stores/useOpeningsStore';
import { countOpenings } from '@/lib/pricing';
import { wallLabelRo } from '@/lib/i18n/ro';
import { OPENING_DRAG_TYPE } from '@/components/3d/openings/placement';
import { isPlacementHintSeen, subscribePlacementHint } from '@/components/3d/openings/placementHint';
import { wallKindOf } from '@/components/3d/openings/anchors';
import { useTouchLayout } from '../PlacementStatus';
import OpeningsShortcuts from '../OpeningsShortcuts';
import OpeningsSymmetry from '../OpeningsSymmetry';
import { twinOf } from '@/components/3d/openings/symmetry';
import type { RepeatPattern } from '@/stores/useOpeningsStore';
import { REPEAT_MAX_COUNT } from '@/components/3d/openings/repeat';

/** Hidden on the server and during hydration; the browser's flag afterwards. */
const usePlacementHintSeen = () => useSyncExternalStore(subscribePlacementHint, () => isPlacementHintSeen(), () => true);

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
  const activeTool = useOpeningsStore((s) => s.activeTool);
  const setActiveTool = useOpeningsStore((s) => s.setActiveTool);
  const selectedOpeningId = useOpeningsStore((s) => s.selectedOpeningId);
  const openings = useOpeningsStore((s) => s.openings);
  const updateOpening = useOpeningsStore((s) => s.updateOpening);
  const removeOpening = useOpeningsStore((s) => s.removeOpening);
  const selectOpening = useOpeningsStore((s) => s.selectOpening);
  const wallSpans = useOpeningsStore((s) => s.wallSpans);
  const conflicts = useOpeningsStore((s) => s.conflicts);
  const autoPlaceOpening = useOpeningsStore((s) => s.autoPlaceOpening);
  const centreOpening = useOpeningsStore((s) => s.centreOpening);
  const snapEnabled = useOpeningsStore((s) => s.snapEnabled);
  const setSnapEnabled = useOpeningsStore((s) => s.setSnapEnabled);
  const duplicateOpening = useOpeningsStore((s) => s.duplicateOpening);
  const copyOpening = useOpeningsStore((s) => s.copyOpening);
  const repeatOpening = useOpeningsStore((s) => s.repeatOpening);
  const message = useOpeningsStore((s) => s.message);
  const touch = useTouchLayout();
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatKind, setRepeatKind] = useState<RepeatPattern['kind']>('every');
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatReport, setRepeatReport] = useState<string | null>(null);
  useEffect(() => setRepeatReport(null), [selectedOpeningId]);
  const intents = useOpeningsStore((s) => s.intents);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [autoPlaceFailed, setAutoPlaceFailed] = useState<string | null>(null);
  const conflictKinds = new Map<string, Set<string>>();
  for (const c of conflicts) conflictKinds.set(c.openingId, (conflictKinds.get(c.openingId) ?? new Set()).add(c.kind));
  const doesNotFit = (id: string) => conflictKinds.get(id)?.has('fit') ?? false;
  const unfitCount = [...conflictKinds.values()].filter((k) => k.has('fit')).length;
  const reposition = (id: string) => {
    const ok = autoPlaceOpening(id);
    setAutoPlaceFailed(ok ? null : id);
    selectOpening(id);
  };
  /** "Reașază automat": only for openings that no longer fit (T1a). */
  const repositionButton = (id: string) => (
    <button
      type="button"
      onClick={() => reposition(id)}
      className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-colors"
    >
      Reașază automat
    </button>
  );

  const selectedOpening = openings.find((o) => o.id === selectedOpeningId) || null;
  // Inputs are bounded by the selected wall; the store clamps every update to it as well.
  const selectedWall = selectedOpening && wallSpans ? wallSpans[selectedOpening.wallId] : null;
  const maxWidth = selectedWall ? Math.floor(selectedWall.length * 10) / 10 : undefined;
  const maxHeight = selectedWall ? Math.floor(selectedWall.height * 10) / 10 : undefined;

  const tools: { type: OpeningType; label: string }[] = [
    { type: 'window', label: 'Geamuri' },
    { type: 'door', label: 'Uși' },
    { type: 'garageDoor', label: 'Uși industriale' },
  ];

  const handleToolClick = (tool: OpeningType) => {
    setActiveTool(activeTool === tool ? null : tool);
  };
  const hintSeen = usePlacementHintSeen();

  // The tool belongs to this step: leaving it ends placing.
  useEffect(() => () => useOpeningsStore.getState().setActiveTool(null), []);

  // Count openings by type
  const { windows: windowCount, doors: doorCount, garageDoors: garageDoorCount } = countOpenings(openings);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col"
    >
      <OpeningsShortcuts />
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-black uppercase mb-1">Ferestre și Uși</h3>
      </div>

      <div className="space-y-4 flex-1">
        {/* Tool buttons */}
        <div className="flex gap-2">
          {tools.map((tool) => {
            const Icon = ICON_MAP[tool.type];
            return (
              <button
                key={tool.type}
                type="button"
                aria-pressed={activeTool === tool.type}
                onClick={() => handleToolClick(tool.type)}
                // Desktop alternative: drag the card straight onto a wall (PlacementPreview handles the drop).
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(OPENING_DRAG_TYPE, tool.type);
                  e.dataTransfer.effectAllowed = 'copy';
                  setActiveTool(tool.type);
                }}
                title="Click și apoi click pe perete, sau trage pe un perete"
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

        {/* First-time hint: until the first placement in this browser. */}
        {!hintSeen && (
          <p className="text-xs text-gray-600 text-center rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            1. Alege tipul · 2. Click pe perete · 3. Trage pentru a muta
          </p>
        )}

        {/* Phones have no Alt key: snapping is switched here (not remembered). */}
        {touch && (
          <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 cursor-pointer">
            <span className="text-xs font-bold text-gray-800">Aliniere: {snapEnabled ? 'on' : 'off'}</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={snapEnabled}
              checked={snapEnabled}
              onChange={(e) => setSnapEnabled(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-primary)]"
            />
          </label>
        )}

        <OpeningsSymmetry />

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
                  // T1e: a twin asks first ("Ștergi și perechea?").
                  if (twinOf(intents, selectedOpening.id)) {
                    setConfirmDeleteId(selectedOpening.id);
                    return;
                  }
                  removeOpening(selectedOpening.id);
                  selectOpening(null);
                }}
                className="text-red-500 hover:text-red-700 text-sm font-bold cursor-pointer transition-colors px-2 py-1 rounded hover:bg-red-50"
              >
                Șterge
              </button>
            </div>

            {confirmDeleteId === selectedOpening.id && (
              <div role="alertdialog" aria-label="Ștergi și perechea?" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 space-y-2">
                <p className="text-xs font-bold text-red-800">Ștergi și perechea?</p>
                <div className="flex gap-2">
                  {(
                    [
                      ['Doar acesta', false],
                      ['Ambele', true],
                    ] as const
                  ).map(([label, withTwin]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        removeOpening(selectedOpening.id, { withTwin });
                        setConfirmDeleteId(null);
                        selectOpening(null);
                      }}
                      className="flex-1 px-2 py-1.5 rounded-md border border-red-300 bg-white text-xs font-bold text-red-700 hover:bg-red-100 cursor-pointer"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1.5 rounded-md text-xs font-bold text-gray-600 hover:text-black cursor-pointer"
                  >
                    Renunță
                  </button>
                </div>
              </div>
            )}

            {/* Width */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Lățime</span>
              <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1 bg-white">
                <input
                  type="number"
                  value={Math.round(selectedOpening.width * 100) / 100}
                  min={MIN_OPENING_SIZE}
                  max={maxWidth}
                  step={0.1}
                  className="w-12 text-right outline-none text-black font-medium"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= MIN_OPENING_SIZE) updateOpening(selectedOpening.id, { width: val });
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
                  min={MIN_OPENING_SIZE}
                  max={maxHeight}
                  step={0.1}
                  className="w-12 text-right outline-none text-black font-medium"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= MIN_OPENING_SIZE) updateOpening(selectedOpening.id, { height: val });
                  }}
                />
                <span className="text-gray-500 ml-1">m</span>
              </div>
            </div>

            {/* T1c: centre buttons ("în travee" only on side walls, which have bays). */}
            <div className="flex gap-2">
              {wallKindOf(selectedOpening.wallId) === 'side' && (
                <button
                  type="button"
                  onClick={() => centreOpening(selectedOpening.id, 'bay')}
                  className="flex-1 px-2 py-1.5 rounded-md border border-gray-300 text-xs font-bold text-gray-700 hover:border-[var(--color-primary)] hover:text-black cursor-pointer transition-colors"
                >
                  Centrează în travee
                </button>
              )}
              <button
                type="button"
                onClick={() => centreOpening(selectedOpening.id, 'wall')}
                className="flex-1 px-2 py-1.5 rounded-md border border-gray-300 text-xs font-bold text-gray-700 hover:border-[var(--color-primary)] hover:text-black cursor-pointer transition-colors"
              >
                Centrează pe perete
              </button>
            </div>

            {/* T1d: duplicate / copy / repeat. */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => duplicateOpening(selectedOpening.id)}
                title="Ctrl/⌘ + D"
                className="flex-1 px-2 py-1.5 rounded-md border border-gray-300 text-xs font-bold text-gray-700 hover:border-[var(--color-primary)] hover:text-black cursor-pointer transition-colors"
              >
                Duplică
              </button>
              <button
                type="button"
                onClick={() => copyOpening(selectedOpening.id)}
                title="Ctrl/⌘ + C, apoi click pe perete sau Ctrl/⌘ + V"
                className="flex-1 px-2 py-1.5 rounded-md border border-gray-300 text-xs font-bold text-gray-700 hover:border-[var(--color-primary)] hover:text-black cursor-pointer transition-colors"
              >
                Copiază
              </button>
              {wallKindOf(selectedOpening.wallId) === 'side' && (
                <button
                  type="button"
                  aria-expanded={repeatOpen}
                  onClick={() => {
                    setRepeatOpen(!repeatOpen);
                    setRepeatReport(null);
                  }}
                  className={`flex-1 px-2 py-1.5 rounded-md border text-xs font-bold cursor-pointer transition-colors ${
                    repeatOpen ? 'border-[var(--color-primary)] text-black' : 'border-gray-300 text-gray-700 hover:border-[var(--color-primary)] hover:text-black'
                  }`}
                >
                  Repetă
                </button>
              )}
            </div>
            {message && <p className="text-xs font-semibold text-red-700">{message.text}</p>}

            {repeatOpen && wallKindOf(selectedOpening.wallId) === 'side' && (
              <fieldset className="space-y-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
                <legend className="sr-only">Repetă</legend>
                {(
                  [
                    ['every', 'În fiecare travee'],
                    ['everySecond', 'La fiecare a doua travee'],
                    ['count', 'N bucăți, egal distanțate'],
                  ] as const
                ).map(([kind, label]) => (
                  <label key={kind} className="flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer">
                    <input
                      type="radio"
                      name="repeat-pattern"
                      checked={repeatKind === kind}
                      onChange={() => setRepeatKind(kind)}
                      className="accent-[var(--color-primary)]"
                    />
                    {label}
                    {kind === 'count' && (
                      <input
                        type="number"
                        aria-label="Număr de bucăți"
                        min={2}
                        max={REPEAT_MAX_COUNT}
                        step={1}
                        value={repeatCount}
                        onFocus={() => setRepeatKind('count')}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!isNaN(n)) setRepeatCount(Math.min(REPEAT_MAX_COUNT, Math.max(1, n)));
                        }}
                        className="w-14 ml-auto rounded border border-gray-300 bg-white px-2 py-0.5 text-right text-black"
                      />
                    )}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const pattern: RepeatPattern = repeatKind === 'count' ? { kind: 'count', n: repeatCount } : { kind: repeatKind };
                    const r = repeatOpening(selectedOpening.id, pattern);
                    if (!r) return;
                    const copies = r.added === 1 ? '1 copie' : `${r.added} copii`;
                    const parts = [r.twins > 0 ? `${copies} + ${r.twins === 1 ? '1 pereche adăugată' : `${r.twins} perechi adăugate`}` : `${copies} ${r.added === 1 ? 'adăugată' : 'adăugate'}`];
                    if (r.skipped > 0) parts.push(`${r.skipped} nu au încăput`);
                    setRepeatReport(parts.join(' · '));
                  }}
                  className="w-full px-2 py-1.5 rounded-md bg-[var(--color-primary)] text-[var(--ui-accent-text)] text-xs font-bold cursor-pointer"
                >
                  Aplică
                </button>
                {repeatReport && <p className="text-xs font-semibold text-gray-700">{repeatReport}</p>}
              </fieldset>
            )}

            {doesNotFit(selectedOpening.id) && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-red-50 border border-red-200 px-2.5 py-2">
                <span className="text-xs font-semibold text-red-700">Nu mai încape aici după modificarea halei.</span>
                {repositionButton(selectedOpening.id)}
              </div>
            )}
            {autoPlaceFailed === selectedOpening.id && doesNotFit(selectedOpening.id) && (
              <p className="text-xs text-red-700">Nu am găsit un loc liber. Mută sau micșorează deschiderea manual.</p>
            )}

            {/* Wall info */}
            <div className="text-xs text-gray-500 font-medium pt-3 border-t border-gray-100">
              Perete: {wallLabelRo(selectedOpening.wallId)}
            </div>
          </motion.div>
        )}

        {conflicts.length > 0 && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {conflictKinds.size === 1 ? '1 deschidere are' : `${conflictKinds.size} deschideri au`} conflicte (suprapunere,
            stâlp/cadru, burlan sau nu mai încape). Mută sau redimensionează deschiderile marcate cu roșu înainte de a
            continua{unfitCount > 0 ? ', sau folosește „Reașază automat”' : ''}.
          </div>
        )}

        {/* Openings list */}
        {openings.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
              Lista de Deschideri
            </span>
            {openings.map((o) => {
              const Icon = ICON_MAP[o.type];
              const unfit = doesNotFit(o.id);
              return (
                <div
                  key={o.id}
                  className={`w-full flex items-center gap-2 rounded-lg transition-all ${
                    conflictKinds.has(o.id)
                      ? 'bg-red-50 border-2 border-red-500 text-red-700'
                      : selectedOpeningId === o.id
                      ? 'bg-orange-50 border-2 border-[var(--color-primary)] text-black'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  } ${unfit ? 'pr-1.5' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => selectOpening(o.id)}
                    className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${selectedOpeningId === o.id ? 'text-[var(--color-primary)]' : 'text-gray-400'}`} />
                      <span className="text-xs font-bold whitespace-nowrap">
                        {o.width.toFixed(1)} × {o.height.toFixed(1)}m
                      </span>
                      {unfit && <span className="text-[11px] font-semibold whitespace-nowrap">nu încape</span>}
                    </div>
                    <span className="text-xs text-gray-400 font-medium truncate">
                      {wallLabelRo(o.wallId)}
                    </span>
                  </button>
                  {unfit && repositionButton(o.id)}
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-4 border-t border-gray-200">
          <ColorPicker title="Culori uși și ferestre" components={['doors', 'windows']} />
        </div>
      </div>

    </motion.div>
  );
}
