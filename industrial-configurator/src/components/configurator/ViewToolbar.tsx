'use client';

/**
 * Fixed views of the 3D hall, over the canvas: an X / Y / Z axis gizmo that turns with the camera (click an axis to look
 * along it), buttons for the 3D view, the four elevations and the plan, and the projection switch.
 * Keyboard: 0 = 3D, 1 = front, 2 = back, 3 = left, 4 = right, 5 = plan, P = perspective / orthographic.
 */
import { useEffect } from 'react';
import {
  CAMERA_VIEWS,
  CAMERA_VIEW_AXES,
  CAMERA_VIEW_KEYS,
  CAMERA_VIEW_LABELS,
  type CameraView,
} from '@/lib/hall/cameraViews';
import { useViewStore } from '@/stores/useViewStore';

/** The gizmo's axes: colour and the view that looks along each end (the camera stands on that side). */
const AXES = [
  { key: 'x', label: 'X', color: '#e5484d', positive: 'right', negative: 'left' },
  { key: 'y', label: 'Y', color: '#30a46c', positive: 'top', negative: null },
  { key: 'z', label: 'Z', color: '#3e63dd', positive: 'front', negative: 'back' },
] as const satisfies readonly { key: 'x' | 'y' | 'z'; positive: CameraView; negative: CameraView | null; label: string; color: string }[];

const GIZMO = 76;
const ARM = 25;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

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

export default function ViewToolbar() {
  const view = useViewStore((s) => s.view);
  const projection = useViewStore((s) => s.projection);
  const goToView = useViewStore((s) => s.goToView);
  const setProjection = useViewStore((s) => s.setProjection);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
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
    `flex items-center justify-between gap-2 w-full px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
      active ? 'bg-[var(--color-primary)] text-[var(--ui-accent-text)]' : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div className="absolute bottom-3 left-3 right-3 md:left-auto md:bottom-auto md:top-3 z-20 flex flex-col items-center md:items-end gap-2 pointer-events-none">
      <div className="pointer-events-auto hidden md:block rounded-full shadow-sm backdrop-blur-md">
        <AxisGizmo />
      </div>
      <div
        role="toolbar"
        aria-label="Vederi fixe"
        className="pointer-events-auto bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm p-1 flex md:flex-col gap-0.5 md:w-[104px]"
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
        <span className="md:hidden w-px bg-gray-200 mx-0.5" />
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
      </div>
    </div>
  );
}
