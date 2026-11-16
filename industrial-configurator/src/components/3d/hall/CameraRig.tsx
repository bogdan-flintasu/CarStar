'use client';

/**
 * Orbit camera of the configurator.
 *  - Frames the whole hall when the scene opens and whenever `frameKey` changes (the "Reconfigurează" button).
 *  - Otherwise the user's orbit is theirs: when the hall changes size, the view only glides along with the hall's
 *    centre (camera and orbit target move together, so angle and zoom are kept).
 * Renders on demand: frames are requested only while the view is still moving.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PerspectiveCamera, Vector3 } from 'three';
import type { HallLayout } from '@/lib/hall';

interface CameraRigProps {
  layout: HallLayout;
  /** Orbiting is switched off while an opening is being dragged. */
  enabled?: boolean;
  /** Change it to frame the hall again. */
  frameKey?: unknown;
}

/** Where the camera stands relative to the hall when framing it: front-left corner, slightly above the eave. */
const FRAMING_DIRECTION = new Vector3(-0.55, 0.38, 0.75).normalize();
const FRAMING_MARGIN = 1.05;
/** Exponential glide towards the hall's centre: time constant 1 / FOLLOW_RATE seconds. */
const FOLLOW_RATE = 6;
const ARRIVED = 1e-3;
const MAX_FRAME_TIME = 1 / 30;

type Orbit = { target: Vector3; update: () => void };

export default function CameraRig({ layout, enabled = true, frameKey }: CameraRigProps) {
  const invalidate = useThree((state) => state.invalidate);
  const { min, max } = layout.bounds;
  const centre = useMemo(
    () => new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2),
    [min, max],
  );
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;

  const framingDue = useRef(true);
  /** The hall centre the view has caught up with; the user's own panning is never undone. */
  const followed = useRef(new Vector3());
  useEffect(() => {
    framingDue.current = true;
    invalidate();
  }, [frameKey, invalidate]);
  useEffect(() => invalidate(), [centre, invalidate]);

  useFrame(({ camera, controls }, delta) => {
    const orbit = controls as unknown as Orbit | null;
    if (!orbit) return;

    if (framingDue.current) {
      framingDue.current = false;
      // Fit the hall's bounding sphere inside the narrower of the two view angles: on a portrait phone
      // the horizontal angle is the limiting one, and framing by the vertical one would crop the hall's sides.
      let halfFov = Math.PI / 4;
      if (camera instanceof PerspectiveCamera) {
        const halfV = (camera.fov * Math.PI) / 360;
        const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
        halfFov = Math.min(halfV, halfH);
      }
      const distance = (radius / Math.sin(halfFov)) * FRAMING_MARGIN;
      orbit.target.copy(centre);
      followed.current.copy(centre);
      camera.position.copy(centre).addScaledVector(FRAMING_DIRECTION, distance);
      orbit.update();
      return;
    }

    const step = centre.clone().sub(followed.current);
    if (step.length() < ARRIVED) return;
    // After an idle spell the first delta is the whole pause: cap it so the glide still starts gently.
    step.multiplyScalar(1 - Math.exp(-FOLLOW_RATE * Math.min(delta, MAX_FRAME_TIME)));
    followed.current.add(step);
    orbit.target.add(step);
    camera.position.add(step);
    orbit.update();
    invalidate();
  });

  return <OrbitControls makeDefault enabled={enabled} maxPolarAngle={Math.PI / 2} enablePan />;
}
