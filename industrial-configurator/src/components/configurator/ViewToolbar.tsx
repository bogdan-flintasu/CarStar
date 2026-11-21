'use client';

/**
 * Fixed views of the 3D hall, over the canvas: an X / Y / Z axis gizmo that turns with the camera (click an axis to look
 * along it), buttons for the 3D view, the four elevations and the plan, and the projection switch.
 * Keyboard: 0 = 3D, 1 = front, 2 = back, 3 = left, 4 = right, 5 = plan, P = perspective / orthographic.
 * Two popovers (T3d): "Secțiune" (section cut: off / transversal / longitudinal, its position, caps) and "Straturi"
 * (which layers of the hall are drawn).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CAMERA_VIEWS,
  CAMERA_VIEW_AXES,
  CAMERA_VIEW_KEYS,
  CAMERA_VIEW_LABELS,
  type CameraView,
} from '@/lib/hall/cameraViews';
import { useWalkStore } from '@/stores/useWalkStore';
import { useViewStore } from '@/stores/useViewStore';
import { SECTION_LABELS, SECTION_MODES, sectionAxis, sectionCoordinate } from '@/components/3d/hall/section';
import { allLayersVisible, HALL_LAYERS, LAYER_LABELS } from '@/components/3d/hall/layers';
import { isTypingTarget } from '@/components/3d/openings/shortcuts';

/** The gizmo's axes: colour and the view that looks along each end (the camera stands on that side). */
const AXES = [
  { key: 'x', label: 'X', color: '#e5484d', positive: 'right', negative: 'left' },
  { key: 'y', label: 'Y', color: '#30a46c', positive: 'top', negative: null },
  { key: 'z', label: 'Z', color: '#3e63dd', positive: 'front', negative: 'back' },
] as const satisfies readonly { key: 'x' | 'y' | 'z'; positive: CameraView; negative: CameraView | null; label: string; color: string }[];

const GIZMO = 76;
const ARM = 25;

function AxisGizmo() {
  const axes = useViewStore((s) => s.axes);
  const goToView = useViewStore((s) => s.goToView);
  const c = GIZMO / 2;

  // Ends drawn back to front, so the nearer ones are on top.
  const ends = AXES.flatMap((axis) => {
    const [sx, sy, depth] = axes[axis.key];
    return [
      { axis, sign: 1, x: c + sx * ARM, y: c - sy * ARM, depth, view: axis.positive },
      { axis, sign: -1, x: c - sx * ARM, y: c + sy * ARM, depth: -depth, view: axis.negative },
    ];
  }).sort((a, b) => a.depth - b.depth);

  return (
    <svg
      width={GIZMO}
      height={GIZMO}
      viewBox={`0 0 ${GIZMO} ${GIZMO}`}
      className="block"
      role="group"
      aria-label="Axele X, Y, Z: click pe o axă pentru vederea de-a lungul ei"
    >
      <circle cx={c} cy={c} r={c - 1} className="fill-white/70 stroke-gray-200" />
      {ends.map(({ axis, sign, x, y }) =>
        sign > 0 ? <line key={`l-${axis.key}`} x1={c} y1={c} x2={x} y2={y} stroke={axis.color} strokeWidth={2.5} strokeLinecap="round" /> : null,
      )}
      {ends.map(({ axis, sign, x, y, view, depth }) => {
        const r = sign > 0 ? 8 : 5.5;
        const faded = depth < -0.2 ? 0.55 : 1;
        const label = view ? `${CAMERA_VIEW_LABELS[view]} (${sign > 0 ? '+' : '−'}${axis.label})` : undefined;
        const body = (
          <>
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={sign > 0 ? axis.color : 'transparent'}
              stroke={axis.color}
              strokeWidth={sign > 0 ? 0 : 2}
              opacity={faded}
            />
            {sign > 0 && (
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" className="select-none pointer-events-none">
                {axis.label}
              </text>
            )}
          </>
        );
        return view ? (
          <g
            key={`e-${axis.key}${sign}`}
            role="button"
            tabIndex={-1}
            aria-label={label}
            className="cursor-pointer hover:opacity-80"
            onClick={() => goToView(view)}
          >
            <title>{label}</title>
            {body}
          </g>
        ) : (
          <g key={`e-${axis.key}${sign}`}>{body}</g>
        );
      })}
    </svg>
  );
}

type PopoverId = 'section' | 'layers';

const metres = (m: number) => `${m.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

/** A toolbar button that opens a panel next to the toolbar (above it on phones), closed by Escape or a click outside. */
function PopoverButton({
  id,
  open,
  onOpen,
  label,
  icon,
  active,
  className,
  children,
}: {
  id: PopoverId;
  open: boolean;
  onOpen: (id: PopoverId | null) => void;
  label: string;
  icon: ReactNode;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`view-popover-${id}`}
        aria-label={label}
        title={label}
        data-popover-toggle={id}
        onClick={() => onOpen(open ? null : id)}
        className={`${className} ${open && !active ? 'bg-gray-100' : ''}`}
      >
        <span className="md:hidden">{icon}</span>
        <span className="hidden md:inline">{label}</span>
        <span className="hidden md:inline opacity-70">{icon}</span>
      </button>
      {open && (
        <div
          id={`view-popover-${id}`}
          role="dialog"
          aria-label={label}
          className="absolute bottom-full mb-2 right-0 md:bottom-auto md:mb-0 md:top-0 md:right-full md:mr-2 w-[232px] max-w-[calc(100vw-24px)] bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-md p-2.5 text-[11px] text-gray-700"
        >
          {children}
        </div>
      )}
    </>
  );
}

const SectionIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M2 6 8 2l6 4v8H2z" strokeLinejoin="round" />
    <path d="M8 1v14" strokeDasharray="2 1.5" />
  </svg>
);
const LayersIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="m8 2 6 3-6 3-6-3z" strokeLinejoin="round" />
    <path d="m2 8 6 3 6-3M2 11l6 3 6-3" strokeLinejoin="round" />
  </svg>
);

function SectionPanel() {
  const mode = useViewStore((s) => s.sectionMode);
  const fraction = useViewStore((s) => s.sectionFraction);
  const caps = useViewStore((s) => s.sectionCaps);
  const extents = useViewStore((s) => s.sectionExtents);
  const { setSectionMode, setSectionFraction, setSectionCaps } = useViewStore.getState();
  const axis = mode === 'off' ? null : sectionAxis(mode);
  const distance = axis && extents ? sectionCoordinate(axis, fraction, extents) - extents[axis][0] : null;

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Secțiune" className="grid grid-cols-3 gap-0.5 bg-gray-100 rounded-lg p-0.5">
        {SECTION_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setSectionMode(m)}
            className={`px-1 py-1 rounded-md font-bold truncate cursor-pointer ${
              mode === m ? 'bg-[var(--color-primary)] text-[var(--ui-accent-text)]' : 'hover:bg-white'
            }`}
            title={m === 'transversal' ? 'Taie de-a curmezișul: arată cadrul portal' : m === 'longitudinal' ? 'Taie pe lungime' : 'Fără secțiune'}
          >
            {m === 'off' ? SECTION_LABELS.off : m === 'transversal' ? 'Transv.' : 'Longit.'}
          </button>
        ))}
      </div>
      <label className={`flex flex-col gap-1 ${axis ? '' : 'opacity-50'}`}>
        <span className="flex justify-between font-semibold">
          <span>Poziție</span>
          <span className="tabular-nums">{distance !== null ? metres(distance) : '—'}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={fraction}
          disabled={!axis}
          onChange={(e) => setSectionFraction(Number(e.target.value))}
          aria-label="Poziția secțiunii"
          className="w-full accent-[var(--color-primary)] cursor-pointer disabled:cursor-default"
        />
      </label>
      <label className={`flex items-center gap-2 font-semibold cursor-pointer ${axis ? '' : 'opacity-50'}`}>
        <input
          type="checkbox"
          checked={caps}
          disabled={!axis}
          onChange={(e) => setSectionCaps(e.target.checked)}
          className="accent-[var(--color-primary)]"
        />
        Capace (umple fețele tăiate)
      </label>
      {axis && <p className="text-[10px] text-gray-500 leading-snug">Trageți bara colorată de deasupra halei sau folosiți cursorul.</p>}
    </div>
  );
}

function LayersPanel() {
  const layers = useViewStore((s) => s.layers);
  const { toggleLayer, showAllLayers } = useViewStore.getState();
  return (
    <div className="flex flex-col gap-1">
      {HALL_LAYERS.map((id) => (
        <label key={id} className="flex items-center gap-2 font-semibold cursor-pointer md:py-0.5">
          <input type="checkbox" checked={layers[id]} onChange={() => toggleLayer(id)} className="accent-[var(--color-primary)]" />
          {LAYER_LABELS[id]}
        </label>
      ))}
      <button
        type="button"
        disabled={allLayersVisible(layers)}
        onClick={showAllLayers}
        className="mt-1 self-start px-2 py-1 rounded-md font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default cursor-pointer"
      >
        Arată toate
      </button>
    </div>
  );
}

export default function ViewToolbar() {
  const view = useViewStore((s) => s.view);
  const projection = useViewStore((s) => s.projection);
  const goToView = useViewStore((s) => s.goToView);
  const setProjection = useViewStore((s) => s.setProjection);
  const sectionOn = useViewStore((s) => s.sectionMode !== 'off');
  const layersFiltered = useViewStore((s) => !allLayersVisible(s.layers));
  const [popover, setPopover] = useState<PopoverId | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);

  // Escape or a click outside the toolbar closes the open panel.
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPopover(null);
    const onDown = (e: PointerEvent) => {
      if (!toolbar.current?.contains(e.target as Node)) setPopover(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [popover]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const match = CAMERA_VIEWS.find((v) => CAMERA_VIEW_KEYS[v] === e.key);
      if (match) {
        e.preventDefault();
        goToView(match);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        const s = useViewStore.getState();
        s.setProjection(s.projection === 'perspective' ? 'orthographic' : 'perspective');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToView]);

  const button = (active: boolean) =>
    `flex items-center justify-between gap-2 w-full px-[5px] md:px-2 py-1 rounded-md text-[10px] md:text-[11px] font-bold transition-colors cursor-pointer ${
      active ? 'bg-[var(--color-primary)] text-[var(--ui-accent-text)]' : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div className={`absolute bottom-3 left-3 right-3 md:left-auto md:bottom-auto md:top-3 ${popover ? 'z-30' : 'z-20'} flex flex-col items-center md:items-end gap-2 pointer-events-none`}>
      <div className="pointer-events-auto hidden md:block rounded-full shadow-sm backdrop-blur-md">
        <AxisGizmo />
      </div>
      <div
        ref={toolbar}
        role="toolbar"
        aria-label="Vederi fixe"
        className="relative pointer-events-auto bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm p-1 flex md:flex-col md:gap-0.5 md:w-[104px] max-w-full"
      >
        {CAMERA_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            title={`${CAMERA_VIEW_LABELS[v]} · axa ${CAMERA_VIEW_AXES[v]} · tasta ${CAMERA_VIEW_KEYS[v]}`}
            onClick={() => goToView(v)}
            className={button(view === v)}
          >
            <span>{CAMERA_VIEW_LABELS[v]}</span>
            <span className="hidden md:inline text-[9px] font-semibold opacity-60 tabular-nums">{CAMERA_VIEW_AXES[v]}</span>
          </button>
        ))}
        <span className="hidden md:block h-px bg-gray-200 my-0.5" />
        <span className="md:hidden w-px bg-gray-200 mx-px" />
        <button
          type="button"
          title="Proiecție perspectivă / ortogonală · tasta P"
          aria-label={projection === 'perspective' ? 'Treci la proiecția ortogonală' : 'Treci la proiecția perspectivă'}
          onClick={() => setProjection(projection === 'perspective' ? 'orthographic' : 'perspective')}
          className={button(projection === 'orthographic')}
        >
          <span>{projection === 'perspective' ? 'Persp.' : 'Orto'}</span>
          <span className="hidden md:inline text-[9px] font-semibold opacity-60">P</span>
        </button>
        <span className="hidden md:block h-px bg-gray-200 my-0.5" />
        <span className="md:hidden w-px bg-gray-200 mx-px" />
        <PopoverButton
          id="section"
          open={popover === 'section'}
          onOpen={setPopover}
          label="Secțiune"
          icon={SectionIcon}
          active={sectionOn}
          className={button(sectionOn)}
        >
          <SectionPanel />
        </PopoverButton>
        <PopoverButton
          id="layers"
          open={popover === 'layers'}
          onOpen={setPopover}
          label="Straturi"
          icon={LayersIcon}
          active={layersFiltered}
          className={button(layersFiltered)}
        >
          <LayersPanel />
        </PopoverButton>
        <span className="hidden md:block h-px bg-gray-200 my-0.5" />
        <span className="md:hidden w-px bg-gray-200 mx-px" />
        <button
          type="button"
          title="Plimbă-te prin interiorul halei, la înălțimea ochilor"
          onClick={() => useWalkStore.getState().enter()}
          className={`${button(false)} !justify-center md:!justify-between`}
        >
          <span className="md:hidden">Intră</span>
          <span className="hidden md:inline">Intră în hală</span>
        </button>
      </div>
    </div>
  );
}
