'use client';

/**
 * Everything over the 3D view while the user walks through the hall (docs/plans/walkthrough.md): the exit button and
 * a one-line hint, the door button, teleport points, a mini-map (tap to go there), the touch joystick and look area
 * on phones, and the credits line of the scenery's models. The walk rig inside the canvas does the moving.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useWalkStore, type WalkPose } from '@/stores/useWalkStore';
import { renderCreditLine } from '@/lib/renderCredits';
import type { WalkPlan } from '@/lib/hall/walkPlan';

const STICK_RADIUS = 48;

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return coarse;
}

/** On-screen joystick: drag from its centre; x right, y forward. */
function Joystick() {
  const setStick = useWalkStore((s) => s.setStick);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const pointer = useRef<number | null>(null);
  const centre = useRef<[number, number]>([0, 0]);

  const move = (e: ReactPointerEvent) => {
    let dx = e.clientX - centre.current[0];
    let dy = e.clientY - centre.current[1];
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    setKnob([dx, dy]);
    setStick([dx / STICK_RADIUS, -dy / STICK_RADIUS]);
  };
  const end = () => {
    pointer.current = null;
    setKnob([0, 0]);
    setStick([0, 0]);
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-6 w-32 h-32 rounded-full bg-white/25 border border-white/60 backdrop-blur-sm touch-none"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        centre.current = [rect.left + rect.width / 2, rect.top + rect.height / 2];
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Deplasare"
    >
      <div
        className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 rounded-full bg-white/90 shadow"
        style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }}
      />
    </div>
  );
}

/** Drag anywhere else on a touch screen to look around. */
function LookArea() {
  const addLook = useWalkStore((s) => s.addLook);
  const last = useRef<Map<number, [number, number]>>(new Map());
  return (
    <div
      className="pointer-events-auto absolute inset-0 touch-none"
      onPointerDown={(e) => {
        last.current.set(e.pointerId, [e.clientX, e.clientY]);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const before = last.current.get(e.pointerId);
        if (!before) return;
        addLook(e.clientX - before[0], e.clientY - before[1]);
        last.current.set(e.pointerId, [e.clientX, e.clientY]);
      }}
      onPointerUp={(e) => last.current.delete(e.pointerId)}
      onPointerCancel={(e) => last.current.delete(e.pointerId)}
    />
  );
}

/** The plan seen from above, north = the back of the hall at the top; tap to walk there. */
function MiniMap({ plan, pose }: { plan: WalkPlan; pose: WalkPose | null }) {
  const teleportTo = useWalkStore((s) => s.teleportTo);
  const b = plan.inside;
  const pad = 2;
  const x0 = b.x0 - pad;
  const z0 = b.z0 - pad;
  const w = b.x1 - b.x0 + 2 * pad;
  const h = b.z1 - b.z0 + 2 * pad;
  // A long hall lies across the map; the map keeps the hall's proportions inside 168 × 120 px.
  const across = h > w;
  const viewW = across ? h : w;
  const viewH = across ? w : h;
  const scale = Math.min(168 / viewW, 120 / viewH);
  const map = (x: number, z: number): [number, number] => (across ? [z - z0, x - x0] : [x - x0, z - z0]);

  return (
    <svg
      width={viewW * scale}
      height={viewH * scale}
      viewBox={`0 0 ${viewW} ${viewH}`}
      className="pointer-events-auto block cursor-crosshair"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const u = ((e.clientX - rect.left) / rect.width) * viewW;
        const v = ((e.clientY - rect.top) / rect.height) * viewH;
        const [x, z] = across ? [v + x0, u + z0] : [u + x0, v + z0];
        teleportTo({ id: 'map', label: 'Hartă', position: [x, z], yaw: pose?.yaw ?? plan.spawn.yaw });
      }}
      aria-label="Harta halei: atinge pentru a merge acolo"
    >
      <rect x={0} y={0} width={viewW} height={viewH} fill="rgba(255,255,255,0.0)" />
      {plan.segments.map((s, i) => {
        const [ax, ay] = map(s.a[0], s.a[1]);
        const [bx, by] = map(s.b[0], s.b[1]);
        return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={s.doorId ? '#f59e0b' : '#111827'} strokeWidth={Math.max(0.35, s.half * 2)} strokeLinecap="square" />;
      })}
      {plan.boxes.map((c, i) => {
        const [cx, cy] = map((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2);
        return <circle key={i} cx={cx} cy={cy} r={0.3} fill="#6b7280" />;
      })}
      {pose && (() => {
        const [px, py] = map(pose.x, pose.z);
        // Looking direction on the ground, mapped like the points.
        const [dx, dz] = [-Math.sin(pose.yaw), -Math.cos(pose.yaw)];
        const [ux, uy] = across ? [dz, dx] : [dx, dz];
        const side: [number, number] = [-uy, ux];
        const tip: [number, number] = [px + ux * 2.2, py + uy * 2.2];
        const l: [number, number] = [px + side[0] * 0.9 - ux * 0.6, py + side[1] * 0.9 - uy * 0.6];
        const r: [number, number] = [px - side[0] * 0.9 - ux * 0.6, py - side[1] * 0.9 - uy * 0.6];
        return <polygon points={`${tip.join(',')} ${l.join(',')} ${r.join(',')}`} fill="var(--color-primary, #e11d48)" stroke="white" strokeWidth={0.25} />;
      })()}
    </svg>
  );
}

export default function WalkOverlay() {
  const phase = useWalkStore((s) => s.phase);
  const plan = useWalkStore((s) => s.plan);
  const pose = useWalkStore((s) => s.pose);
  const reachable = useWalkStore((s) => s.reachable);
  const locked = useWalkStore((s) => s.locked);
  const sceneryLoaded = useWalkStore((s) => s.sceneryLoaded);
  const leave = useWalkStore((s) => s.leave);
  const toggleDoor = useWalkStore((s) => s.toggleDoor);
  const teleportTo = useWalkStore((s) => s.teleportTo);
  const coarse = useCoarsePointer();
  const [mapOpen, setMapOpen] = useState(true);

  if (phase === 'off') return null;
  // Only ever rendered in the browser (the walk starts from a click).
  const origin = window.location.origin;
  const walking = phase === 'walking';
  const doorLabel = reachable ? `${reachable.open ? 'Închide' : 'Deschide'} ${reachable.type === 'garageDoor' ? 'ușa industrială' : 'ușa'}` : '';

  return (
    <div className="absolute inset-0 z-40 pointer-events-none select-none">
      {walking && coarse && <LookArea />}

      {/* Exit and the hint */}
      <div className="absolute top-3 left-3 right-3 md:right-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={leave}
          className="pointer-events-auto h-9 px-3 rounded-xl bg-gray-950/90 text-white text-xs font-bold shadow-lg backdrop-blur-md cursor-pointer"
        >
          ← Ieși din hală
        </button>
        {walking && (
          <span className="bg-white/90 backdrop-blur-md px-3 py-2 rounded-xl border border-gray-200 shadow-sm text-[11px] font-medium text-gray-700">
            {coarse
              ? 'Joystick: deplasare · trage pe ecran: privire'
              : locked
                ? 'WASD: mers · Shift: alergare · E: ușa · Esc: eliberează mouse-ul'
                : 'Click în imagine: privire cu mouse-ul · WASD / săgeți: mers · Esc: ieșire'}
          </span>
        )}
      </div>

      {/* Teleport points */}
      {walking && plan && (
        <div className="absolute top-14 right-3 md:top-3 flex flex-col items-end gap-1 max-h-[45%] overflow-y-auto">
          {plan.teleports.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => teleportTo(t)}
              className="pointer-events-auto h-8 px-2.5 rounded-lg bg-white/90 backdrop-blur-md border border-gray-200 shadow-sm text-[11px] font-semibold text-gray-700 hover:bg-white cursor-pointer"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Crosshair while the mouse looks */}
      {walking && locked && <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-white/90 shadow" />}

      {/* The door in front */}
      {walking && reachable && (
        <button
          type="button"
          onClick={() => toggleDoor(reachable.id)}
          className="pointer-events-auto absolute bottom-24 md:bottom-16 left-1/2 -translate-x-1/2 h-10 px-4 rounded-full bg-[var(--color-primary)] text-[var(--ui-accent-text)] text-xs font-bold shadow-lg cursor-pointer whitespace-nowrap"
        >
          {doorLabel}
          {!coarse && <span className="ml-2 opacity-70">E</span>}
        </button>
      )}

      {walking && coarse && <Joystick />}

      {/* Mini-map */}
      {walking && plan && (
        <div className="absolute bottom-10 right-3 md:bottom-8 flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            className="pointer-events-auto h-7 px-2 rounded-lg bg-white/90 border border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-600 cursor-pointer"
          >
            {mapOpen ? 'Ascunde harta' : 'Hartă'}
          </button>
          {mapOpen && (
            <div className="p-2 bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm">
              <MiniMap plan={plan} pose={pose} />
            </div>
          )}
        </div>
      )}

      {/* Scenery status and its credits (CC BY 4.0) */}
      <div className="absolute bottom-2 left-3 right-3 text-center text-[10px] text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] truncate">
        {sceneryLoaded ? renderCreditLine(origin) : walking ? 'Se încarcă decorul…' : ''}
      </div>
    </div>
  );
}
