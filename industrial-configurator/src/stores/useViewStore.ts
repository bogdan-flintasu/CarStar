/**
 * State of the 3D view, shared by the view toolbar (outside the canvas) and the camera rig (inside it):
 * the fixed view the camera is on (null once the user orbits away), the projection, and the camera's orientation for
 * the axis gizmo. Not persisted: every visit starts in the 3D view.
 */
import { create } from 'zustand';
import type { CameraView, Projection } from '@/lib/hall/cameraViews';

/** Screen-space direction of the world axes, as the camera sees them: [right, up, towards the viewer] per axis. */
export type AxisScreen = { x: [number, number, number]; y: [number, number, number]; z: [number, number, number] };

interface ViewState {
  /** The fixed view the camera is on, or null when the user moved it freely. */
  view: CameraView | null;
  projection: Projection;
  /** Bumped by every view request, so asking again for the current view re-frames it. */
  request: number;
  axes: AxisScreen;
  /**
   * Go to a fixed view. The axis views switch to the orthographic projection (true elevations and plan), the 3D view
   * back to perspective, unless `projection` says otherwise.
   */
  goToView: (view: CameraView, projection?: Projection) => void;
  setProjection: (projection: Projection) => void;
  /** The user orbited, panned or zoomed: the camera is no longer on a fixed view. */
  leaveView: () => void;
  setAxes: (axes: AxisScreen) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'iso',
  projection: 'perspective',
  request: 0,
  axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
  goToView: (view, projection) =>
    set((s) => ({
      view,
      projection: projection ?? (view === 'iso' ? 'perspective' : 'orthographic'),
      request: s.request + 1,
    })),
  setProjection: (projection) => set((s) => (s.projection === projection ? s : { projection })),
  leaveView: () => set((s) => (s.view === null ? s : { view: null })),
  setAxes: (axes) => set({ axes }),
}));
