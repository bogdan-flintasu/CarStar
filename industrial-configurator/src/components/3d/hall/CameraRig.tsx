'use client';

/**
 * Camera of the configurator: orbit controls, fixed views and the projection.
 *  - Fixed views (src/lib/hall/cameraViews.ts): 3D, front / back (Z), left / right (X), plan (Y). Asking for one glides
 *    the camera there; while the camera stays on it, the view is re-fitted whenever the hall changes size.
 *  - Projection: perspective, or orthographic for true elevations and plan. Switching keeps the hall's size on screen.
 *  - The user's orbit is theirs: orbiting, panning or zooming leaves the fixed view, and from then on a hall that changes
 *    size only makes the view glide along with its centre (angle and zoom are kept).
 *  - The hall is framed in the 3D view when the scene opens and whenever `frameKey` changes ("Reconfigurează").
 * Renders on demand: frames are requested only while the view is moving. It also publishes the camera's orientation
 * for the axis gizmo of the view toolbar.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three';
import type { HallLayout } from '@/lib/hall';
import { CONFIGURATOR_FOV, cameraViewPose, distanceForZoom, hallRadius, zoomForDistance, type CameraPose } from '@/lib/hall/cameraViews';
import { useViewStore, type AxisScreen } from '@/stores/useViewStore';

interface CameraRigProps {
  layout: HallLayout;
  /** Orbiting is switched off while an opening is being dragged. */
  enabled?: boolean;
  /** Change it to frame the hall again in the 3D view. */
  frameKey?: unknown;
}

/** Exponential glide towards the hall's centre: time constant 1 / FOLLOW_RATE seconds. */
const FOLLOW_RATE = 6;
const ARRIVED = 1e-3;
const MAX_FRAME_TIME = 1 / 30;
/** Seconds to glide to a requested view, and to re-fit the current one after the hall changed. */
const VIEW_GLIDE = 0.65;
const REFIT_GLIDE = 0.3;
/** Field of view used for framing when the default camera is not a perspective one. */
const FALLBACK_FOV = CONFIGURATOR_FOV;
const ORTHO_FAR = 6000;

type Orbit = {
  target: Vector3;
  object: Camera;
  update: () => void;
  addEventListener: (type: 'start' | 'change' | 'end', listener: () => void) => void;
  removeEventListener: (type: 'start' | 'change' | 'end', listener: () => void) => void;
};

interface Glide {
  from: CameraPose;
  to: CameraPose;
  elapsed: number;
  duration: number;
}

/**
 * Cameras the rig has already placed. The rig can be remounted while the scene lives on (a camera switch can cause it):
 * only a camera never placed before gets the initial framing, so a remount never undoes the user's view.
 */
const placedCameras = new WeakSet<Camera>();

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function setOrthoFrustum(camera: OrthographicCamera, width: number, height: number) {
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
}

export default function CameraRig({ layout, enabled = true, frameKey }: CameraRigProps) {
  const invalidate = useThree((state) => state.invalidate);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const controls = useThree((state) => state.controls) as unknown as Orbit | null;
  const projection = useViewStore((s) => s.projection);
  const request = useViewStore((s) => s.request);

  const { min, max } = layout.bounds;
  const centre = useMemo(
    () => new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2),
    [min, max],
  );
  const radius = hallRadius(layout);

  const ortho = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0.1, ORTHO_FAR), []);
  /** The canvas' own perspective camera, kept while the orthographic one is in use. */
  const perspective = useRef<PerspectiveCamera | null>(null);
  /** A pose to go to on the next frame: `duration` 0 jumps there. */
  const poseDue = useRef<{ duration: number } | null>(null);
  const glide = useRef<Glide | null>(null);
  /** The hall centre the free view has caught up with; the user's own panning is never undone. */
  const followed = useRef(new Vector3());
  /** Orbit target carried over when the controls are rebuilt for another camera. */
  const savedTarget = useRef(new Vector3());
  const seenControls = useRef<Orbit | null>(null);
  const publishedAxes = useRef<AxisScreen | null>(null);

  // "Reconfigurează" / a loaded configuration: back to the 3D view. Compared with the key seen at mount, so a remount
  // of the rig (a camera switch can cause one) never counts as a request.
  const seenFrameKey = useRef(frameKey);
  useEffect(() => {
    if (Object.is(seenFrameKey.current, frameKey)) return;
    seenFrameKey.current = frameKey;
    useViewStore.getState().goToView('iso');
  }, [frameKey]);

  // Initial framing, for a camera the rig has never placed.
  // A remount starts level with the hall, so the free view does not glide by the whole offset.
  useEffect(() => {
    followed.current.copy(centre);
    if (!placedCameras.has(get().camera)) poseDue.current = { duration: 0 };
    invalidate();
    // Mount only: later hall changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, invalidate]);

  // A view was requested from the toolbar (or above).
  useEffect(() => {
    if (request === 0) return;
    poseDue.current = { duration: VIEW_GLIDE };
    invalidate();
  }, [request, invalidate]);

  // The hall changed: a fixed view is re-fitted, a free one glides along (in useFrame).
  useEffect(() => {
    if (useViewStore.getState().view !== null && !poseDue.current) poseDue.current = { duration: REFIT_GLIDE };
    invalidate();
  }, [centre, radius, invalidate]);

  // Switch the default camera between perspective and orthographic, keeping the picture.
  useEffect(() => {
    const { camera, controls: current, size } = get();
    const orbit = current as unknown as Orbit | null;
    const target = orbit ? orbit.target.clone() : centre.clone();
    const towards = camera.position.clone().sub(target);
    const distance = towards.length();
    towards.normalize();

    if (projection === 'orthographic' && camera instanceof PerspectiveCamera) {
      perspective.current = camera;
      setOrthoFrustum(ortho, size.width, size.height);
      ortho.zoom = zoomForDistance(distance, camera.fov, size.height);
      ortho.up.copy(camera.up);
      ortho.position.copy(target).addScaledVector(towards, Math.max(distance, radius * 3 + 10));
      ortho.lookAt(target);
      ortho.updateProjectionMatrix();
      placedCameras.add(ortho);
      savedTarget.current.copy(target);
      set({ camera: ortho });
    } else if (projection === 'perspective' && camera instanceof OrthographicCamera) {
      // The canvas' own camera, or a new one like it if the rig was remounted since the switch.
      const persp = perspective.current ?? new PerspectiveCamera(FALLBACK_FOV, 1, 0.1, 1000);
      persp.up.copy(camera.up);
      persp.aspect = size.width / Math.max(size.height, 1);
      persp.position.copy(target).addScaledVector(towards, distanceForZoom(camera.zoom, persp.fov, size.height));
      persp.lookAt(target);
      persp.updateProjectionMatrix();
      placedCameras.add(persp);
      savedTarget.current.copy(target);
      set({ camera: persp });
    }
    invalidate();
    // Only a projection change switches the camera; the other values are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection]);

  // Any orbit, pan or zoom by the user leaves the fixed view and cancels a glide. A press alone does not: clicking an
  // opening or a hall component on a flat view must keep the view (and its dimensions), so the view is left only on
  // the first camera change between the controls' `start` and `end`.
  useEffect(() => {
    if (!controls) return;
    let pressed = false;
    const onStart = () => {
      pressed = true;
    };
    const onChange = () => {
      if (!pressed) return;
      pressed = false;
      glide.current = null;
      poseDue.current = null;
      followed.current.copy(centre);
      useViewStore.getState().leaveView();
    };
    const onEnd = () => {
      pressed = false;
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('change', onChange);
    controls.addEventListener('end', onEnd);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('change', onChange);
      controls.removeEventListener('end', onEnd);
    };
  }, [controls, centre]);

  useFrame(({ camera, controls: current, size }, delta) => {
    const orbit = current as unknown as Orbit | null;
    // Right after a projection switch the controls are rebuilt for the new camera: wait for them.
    if (!orbit || orbit.object !== camera) {
      invalidate();
      return;
    }
    if (seenControls.current !== orbit) {
      if (seenControls.current) {
        orbit.target.copy(savedTarget.current);
        orbit.update();
      }
      seenControls.current = orbit;
    }

    const isOrtho = camera instanceof OrthographicCamera;
    const currentPose = (): CameraPose => ({
      position: camera.position.toArray() as CameraPose['position'],
      target: orbit.target.toArray() as CameraPose['target'],
      zoom: isOrtho ? camera.zoom : 1,
    });
    const apply = (pose: CameraPose) => {
      placedCameras.add(camera);
      camera.position.set(...pose.position);
      orbit.target.set(...pose.target);
      if (isOrtho && camera.zoom !== pose.zoom) {
        camera.zoom = pose.zoom;
        camera.updateProjectionMatrix();
      }
      orbit.update();
    };

    if (poseDue.current) {
      const { duration } = poseDue.current;
      poseDue.current = null;
      const view = useViewStore.getState().view ?? 'iso';
      const fov = camera instanceof PerspectiveCamera ? camera.fov : FALLBACK_FOV;
      const pose = cameraViewPose(layout, view, isOrtho ? 'orthographic' : 'perspective', { width: size.width, height: size.height, fov });
      followed.current.copy(centre);
      if (duration <= 0) {
        glide.current = null;
        apply(pose);
      } else {
        glide.current = { from: currentPose(), to: pose, elapsed: 0, duration };
      }
      invalidate();
    }

    const g = glide.current;
    if (g) {
      g.elapsed += Math.min(delta, MAX_FRAME_TIME);
      const t = Math.min(g.elapsed / g.duration, 1);
      const e = easeInOut(t);
      const mix = (a: CameraPose['position'], b: CameraPose['position']): CameraPose['position'] => [
        a[0] + (b[0] - a[0]) * e,
        a[1] + (b[1] - a[1]) * e,
        a[2] + (b[2] - a[2]) * e,
      ];
      apply({
        position: mix(g.from.position, g.to.position),
        target: mix(g.from.target, g.to.target),
        // Zoom is a scale: interpolate it geometrically, so the glide looks even.
        zoom: g.from.zoom * (g.to.zoom / g.from.zoom) ** e,
      });
      if (t >= 1) glide.current = null;
      invalidate();
    } else if (useViewStore.getState().view === null) {
      const step = centre.clone().sub(followed.current);
      if (step.length() >= ARRIVED) {
        // After an idle spell the first delta is the whole pause: cap it so the glide still starts gently.
        step.multiplyScalar(1 - Math.exp(-FOLLOW_RATE * Math.min(delta, MAX_FRAME_TIME)));
        followed.current.add(step);
        orbit.target.add(step);
        camera.position.add(step);
        orbit.update();
        invalidate();
      }
    }

    savedTarget.current.copy(orbit.target);

    // Axis gizmo: where the world axes point on screen (x right, y up, z towards the viewer).
    const q = camera.quaternion;
    const right = new Vector3(1, 0, 0).applyQuaternion(q);
    const up = new Vector3(0, 1, 0).applyQuaternion(q);
    const back = new Vector3(0, 0, 1).applyQuaternion(q);
    const axes: AxisScreen = {
      x: [right.x, up.x, back.x],
      y: [right.y, up.y, back.y],
      z: [right.z, up.z, back.z],
    };
    const last = publishedAxes.current;
    const moved =
      !last || (['x', 'y', 'z'] as const).some((k) => axes[k].some((v, i) => Math.abs(v - last[k][i]) > 1e-3));
    if (moved) {
      publishedAxes.current = axes;
      useViewStore.getState().setAxes(axes);
    }
  });

  return <OrbitControls makeDefault enabled={enabled} maxPolarAngle={Math.PI / 2} enablePan />;
}
