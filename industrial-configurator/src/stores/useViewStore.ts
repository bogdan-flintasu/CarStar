/**
 * State of the 3D view, shared by the view toolbar (outside the canvas) and the camera rig (inside it):
 * the fixed view the camera is on (null once the user orbits away), the projection, and the camera's orientation for
 * the axis gizmo. Not persisted: every visit starts in the 3D view.
 */
import { create } from 'zustand';
import type { CameraView, Projection } from '@/lib/hall/cameraViews';
import { clampFraction, DEFAULT_SECTION_FRACTION, type SectionExtents, type SectionMode } from '@/components/3d/hall/section';
import { ALL_LAYERS_VISIBLE, type HallLayerId, type LayerVisibility } from '@/components/3d/hall/layers';

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

  /** Section cut (T3d): off, across the width (transversal) or along the length (longitudinal). */
  sectionMode: SectionMode;
  /** Position of the cut along its axis, as a fraction of the hall's extent (0..1, default mid-span). */
  sectionFraction: number;
  /** Fill the cut faces of the cladding, roof and slab. */
  sectionCaps: boolean;
  /** The hall's extents along X and Z, published by the 3D view (for the toolbar's metres); null before it mounts. */
  sectionExtents: SectionExtents | null;
  setSectionMode: (mode: SectionMode) => void;
  setSectionFraction: (fraction: number) => void;
  setSectionCaps: (caps: boolean) => void;
  setSectionExtents: (extents: SectionExtents | null) => void;
  /** Section off, back at mid-span, caps on ("Resetează", leaving the configurator). */
  resetSection: () => void;

  /** Layers (T3d, "Straturi"): what is drawn. All on by default; not persisted. */
  layers: LayerVisibility;
  setLayer: (id: HallLayerId, visible: boolean) => void;
  toggleLayer: (id: HallLayerId) => void;
  showAllLayers: () => void;
}

const SECTION_DEFAULTS = { sectionMode: 'off', sectionFraction: DEFAULT_SECTION_FRACTION, sectionCaps: true } as const;

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

  ...SECTION_DEFAULTS,
  sectionExtents: null,
  setSectionMode: (sectionMode) => set((s) => (s.sectionMode === sectionMode ? s : { sectionMode })),
  setSectionFraction: (fraction) =>
    set((s) => {
      const sectionFraction = clampFraction(fraction);
      return s.sectionFraction === sectionFraction ? s : { sectionFraction };
    }),
  setSectionCaps: (sectionCaps) => set((s) => (s.sectionCaps === sectionCaps ? s : { sectionCaps })),
  setSectionExtents: (sectionExtents) => set({ sectionExtents }),
  resetSection: () => set({ ...SECTION_DEFAULTS }),

  layers: ALL_LAYERS_VISIBLE,
  setLayer: (id, visible) => set((s) => (s.layers[id] === visible ? s : { layers: { ...s.layers, [id]: visible } })),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  showAllLayers: () => set({ layers: ALL_LAYERS_VISIBLE }),
}));
