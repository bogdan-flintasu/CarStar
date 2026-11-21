/**
 * State of the interior walk-through (docs/plans/walkthrough.md), shared by the walk rig inside the canvas and the
 * overlay outside it: whether the user is walking, which doors are open, teleport requests, the walker's pose for
 * the mini-map, and the touch controls' input. Not persisted: every walk starts at the entrance with all doors open.
 */
import { create } from 'zustand';
import type { WalkPlan, WalkPoint } from '@/lib/hall/walkPlan';
import { useOpeningsStore } from './useOpeningsStore';
import { useComponentSelection } from './useComponentSelection';
import { useViewStore } from './useViewStore';

/** `entering`/`leaving`: the camera glides between the orbit view and the walker's eyes. */
export type WalkPhase = 'off' | 'entering' | 'walking' | 'leaving';

export interface WalkPose {
  x: number;
  z: number;
  yaw: number;
}

interface WalkState {
  phase: WalkPhase;
  /** Doors by opening id; a door missing here is open. */
  open: Record<string, boolean>;
  /** The door the walker can toggle now (E / the on-screen button), with its state. */
  reachable: { id: string; type: 'door' | 'garageDoor'; open: boolean } | null;
  /** Teleport request: the rig glides there; `n` makes asking twice for the same point count. */
  teleport: { point: WalkPoint; n: number } | null;
  /** Where the walker is, for the mini-map (published a few times a second, not every frame). */
  pose: WalkPose | null;
  /** The quote render's scenery (sky, site, props) is in the scene: the credits line shows. */
  sceneryLoaded: boolean;
  /** Pointer lock is on (desktop mouse-look). */
  locked: boolean;
  /** Touch joystick: x right, y forward, each -1..1. */
  stick: [number, number];
  /** Touch look movement not yet applied by the rig (pixels). */
  look: [number, number];
  /** The walk plan the rig uses, for the mini-map and the teleport buttons. */
  plan: WalkPlan | null;

  enter: () => void;
  /** Starts the glide back; the rig calls `finishLeaving` once the camera is back. */
  leave: () => void;
  startWalking: () => void;
  finishLeaving: () => void;
  toggleDoor: (id: string) => void;
  openDoor: (id: string) => void;
  setReachable: (reachable: WalkState['reachable']) => void;
  teleportTo: (point: WalkPoint) => void;
  setPose: (pose: WalkPose) => void;
  setSceneryLoaded: (loaded: boolean) => void;
  setLocked: (locked: boolean) => void;
  setStick: (stick: [number, number]) => void;
  addLook: (dx: number, dy: number) => void;
  takeLook: () => [number, number];
  setPlan: (plan: WalkPlan | null) => void;
}

/** What entering changed in the view, put back on leaving. */
let savedView: Pick<ReturnType<typeof useViewStore.getState>, 'sectionMode' | 'layers' | 'projection'> | null = null;

export const useWalkStore = create<WalkState>((set, get) => ({
  phase: 'off',
  open: {},
  reachable: null,
  teleport: null,
  pose: null,
  sceneryLoaded: false,
  locked: false,
  stick: [0, 0],
  look: [0, 0],
  plan: null,

  enter: () => {
    if (get().phase !== 'off') return;
    // Editing feedback off, every layer on, no section, perspective: the hall as it will be built.
    useOpeningsStore.getState().selectOpening(null);
    useComponentSelection.getState().clear();
    const view = useViewStore.getState();
    savedView = { sectionMode: view.sectionMode, layers: view.layers, projection: view.projection };
    view.setSectionMode('off');
    view.showAllLayers();
    view.setProjection('perspective');
    set({ phase: 'entering', open: {}, reachable: null, teleport: null, pose: null, stick: [0, 0], look: [0, 0] });
  },
  leave: () => {
    const { phase } = get();
    if (phase === 'entering' || phase === 'walking') set({ phase: 'leaving', reachable: null, stick: [0, 0] });
  },
  startWalking: () => set((s) => (s.phase === 'entering' ? { phase: 'walking' } : s)),
  finishLeaving: () => {
    if (savedView) {
      const view = useViewStore.getState();
      view.setSectionMode(savedView.sectionMode);
      for (const [id, visible] of Object.entries(savedView.layers)) view.setLayer(id as keyof typeof savedView.layers, visible);
      view.setProjection(savedView.projection);
      savedView = null;
    }
    set({ phase: 'off', pose: null, reachable: null, teleport: null, locked: false });
  },
  toggleDoor: (id) => set((s) => ({ open: { ...s.open, [id]: s.open[id] === false } })),
  openDoor: (id) => set((s) => (s.open[id] === false ? { open: { ...s.open, [id]: true } } : s)),
  setReachable: (reachable) =>
    set((s) =>
      s.reachable?.id === reachable?.id && s.reachable?.open === reachable?.open ? s : { reachable },
    ),
  teleportTo: (point) => set((s) => ({ teleport: { point, n: (s.teleport?.n ?? 0) + 1 } })),
  setPose: (pose) => set({ pose }),
  setSceneryLoaded: (sceneryLoaded) => set({ sceneryLoaded }),
  setLocked: (locked) => set({ locked }),
  setStick: (stick) => set({ stick }),
  addLook: (dx, dy) => set((s) => ({ look: [s.look[0] + dx, s.look[1] + dy] })),
  takeLook: () => {
    const look = get().look;
    if (look[0] !== 0 || look[1] !== 0) set({ look: [0, 0] });
    return look;
  },
  setPlan: (plan) => set({ plan }),
}));

/** Whether the walk-through owns the camera (any phase but off). */
export const selectWalking = (s: WalkState) => s.phase !== 'off';
/** Whether a door is open in the walk-through (doors are closed outside it). */
export const isDoorOpen = (s: WalkState, id: string) => s.phase !== 'off' && s.open[id] !== false;

// Dev only: lets the perf script and manual checks drive the walk-through from the console.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  Object.assign(window as object, { __walk: useWalkStore, __openings: useOpeningsStore });
}
