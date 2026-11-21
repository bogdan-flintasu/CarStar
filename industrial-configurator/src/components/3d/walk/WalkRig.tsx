'use client';

/**
 * The walker's camera (docs/plans/walkthrough.md): sits in the canvas next to the orbit rig, which is suspended while
 * the walk-through owns the camera.
 *  - Entering glides from the orbit view to the entrance at eye height; leaving glides back to exactly where the
 *    orbit view was (position, target and field of view).
 *  - Desktop: click to look with the mouse (pointer lock), WASD / arrows to move, Shift to run, E for the door in
 *    front, Esc to release the mouse and Esc again to leave. Touch: the overlay feeds the joystick and look drags
 *    through the walk store.
 *  - Movement goes through the 2D walk plan (src/lib/hall/walkPlan.ts): walls, closed doors and columns are solid,
 *    the floor follows the slab and the terrain.
 * Renders on demand like the live view: frames are requested only while something moves.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Quaternion, Vector3, Euler } from 'three';
import type { HallLayout } from '@/lib/hall';
import {
  buildWalkPlan,
  doorInReach,
  EYE_HEIGHT,
  floorHeightAt,
  moveWalker,
  RUN_SPEED,
  WALK_SPEED,
  type P2,
  type WalkOpening,
  type WalkPoint,
} from '@/lib/hall/walkPlan';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { useWalkStore } from '@/stores/useWalkStore';

/** Wider than the configurator's lens: inside a hall a narrow lens feels like looking through a tube. */
const WALK_FOV = 70;
const ENTER_GLIDE = 1.3;
const TELEPORT_GLIDE = 0.8;
const MAX_FRAME_TIME = 1 / 20;
/** Radians per pixel of mouse or touch movement. */
const MOUSE_LOOK = 0.0022;
const TOUCH_LOOK = 0.005;
const MAX_PITCH = 1.35;
/** How fast the walker reaches its speed (1/s). */
const ACCELERATION = 10;
const POSE_PERIOD = 0.12;

type Orbit = { target: Vector3; update: () => void; object: unknown };

interface Glide {
  fromPosition: Vector3;
  fromQuaternion: Quaternion;
  fromFov: number;
  toPosition: Vector3;
  toQuaternion: Quaternion;
  toFov: number;
  elapsed: number;
  duration: number;
  done: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

function lookQuaternion(yaw: number, pitch: number): Quaternion {
  return new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'YXZ'));
}

export default function WalkRig({ layout }: { layout: HallLayout }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as Orbit | null;
  const phase = useWalkStore((s) => s.phase);
  const open = useWalkStore((s) => s.open);
  const teleport = useWalkStore((s) => s.teleport);
  const openings = useOpeningsStore((s) => s.openings);

  const walkOpenings = useMemo<WalkOpening[]>(
    () => openings.map((o) => ({ id: o.id, type: o.type, wallId: o.wallId, offsetX: o.offsetX, width: o.width, height: o.height })),
    [openings],
  );
  const plan = useMemo(() => buildWalkPlan(layout, walkOpenings, open), [layout, walkOpenings, open]);

  useEffect(() => {
    useWalkStore.getState().setPlan(phase === 'off' ? null : plan);
  }, [plan, phase]);

  const position = useRef<P2>([0, 0]);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const velocity = useRef<[number, number]>([0, 0]);
  const keys = useRef(new Set<string>());
  const mouse = useRef<[number, number]>([0, 0]);
  const glide = useRef<Glide | null>(null);
  const saved = useRef<{ position: Vector3; quaternion: Quaternion; target: Vector3 | null; fov: number } | null>(null);
  const poseTimer = useRef(0);
  const seenTeleport = useRef(teleport?.n ?? 0);

  const eyeAt = (p: P2) => new Vector3(p[0], floorHeightAt(plan, p) + EYE_HEIGHT, p[1]);

  const startGlide = (toPosition: Vector3, toQuaternion: Quaternion, toFov: number, duration: number, done: () => void) => {
    const fov = camera instanceof PerspectiveCamera ? camera.fov : toFov;
    glide.current = {
      fromPosition: camera.position.clone(),
      fromQuaternion: camera.quaternion.clone(),
      fromFov: fov,
      toPosition,
      toQuaternion,
      toFov,
      elapsed: 0,
      duration,
      done,
    };
    invalidate();
  };

  const arriveAt = (point: WalkPoint, duration: number, done: () => void) => {
    position.current = point.position;
    yaw.current = point.yaw;
    pitch.current = 0;
    velocity.current = [0, 0];
    startGlide(eyeAt(point.position), lookQuaternion(point.yaw, 0), WALK_FOV, duration, done);
  };

  // Entering and leaving.
  useEffect(() => {
    if (phase === 'entering') {
      // The projection switch to perspective may still be on its way: wait for the perspective camera.
      if (!(camera instanceof PerspectiveCamera)) return;
      saved.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        target: controls ? controls.target.clone() : null,
        fov: camera.fov,
      };
      arriveAt(plan.spawn, ENTER_GLIDE, () => useWalkStore.getState().startWalking());
    } else if (phase === 'leaving') {
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
      const back = saved.current;
      const finish = () => {
        if (back && controls) {
          controls.target.copy(back.target ?? controls.target);
          controls.update();
        }
        saved.current = null;
        useWalkStore.getState().finishLeaving();
      };
      if (back) startGlide(back.position, back.quaternion, back.fov, ENTER_GLIDE, finish);
      else finish();
    }
    // Only a phase change (or the camera arriving) starts a glide; the plan is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, camera]);

  // Teleport requests from the overlay (buttons, mini-map).
  useEffect(() => {
    if (!teleport || teleport.n === seenTeleport.current) return;
    seenTeleport.current = teleport.n;
    if (useWalkStore.getState().phase !== 'walking') return;
    const target = teleport.point;
    // Never into a wall: the point goes through the plan like a step.
    const settled = moveWalker(plan, target.position, [0, 0]).position;
    arriveAt({ ...target, position: settled }, TELEPORT_GLIDE, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleport]);

  // Keyboard and mouse.
  useEffect(() => {
    if (phase === 'off') return;
    const pressed = keys.current;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (MOVE_KEYS.has(e.code)) {
        keys.current.add(e.code);
        e.preventDefault();
        invalidate();
      } else if (e.code === 'KeyE') {
        const reachable = useWalkStore.getState().reachable;
        if (reachable) useWalkStore.getState().toggleDoor(reachable.id);
      } else if (e.code === 'Escape' && document.pointerLockElement !== gl.domElement) {
        // With the mouse captured, the browser takes this Esc to release it; the next one leaves.
        useWalkStore.getState().leave();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear();
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      mouse.current[0] += e.movementX;
      mouse.current[1] += e.movementY;
      invalidate();
    };
    const onClick = () => {
      if (useWalkStore.getState().phase !== 'walking' || document.pointerLockElement === gl.domElement) return;
      // Touch devices look with the overlay's drag instead.
      if (window.matchMedia('(pointer: coarse)').matches) return;
      try {
        const request = gl.domElement.requestPointerLock() as unknown;
        if (request instanceof Promise) request.catch(() => undefined);
      } catch {
        // Some embedded browsers refuse pointer lock: the arrow keys still turn.
      }
    };
    const onLockChange = () => useWalkStore.getState().setLocked(document.pointerLockElement === gl.domElement);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouseMove);
    gl.domElement.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouseMove);
      gl.domElement.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      pressed.clear();
    };
  }, [phase, gl, invalidate]);

  // Wake the render loop when the touch controls change.
  useEffect(() => useWalkStore.subscribe((now, before) => (now.stick !== before.stick || now.look !== before.look) && invalidate()), [invalidate]);

  useFrame((_, rawDelta) => {
    const state = useWalkStore.getState();
    if (state.phase === 'off') return;
    const delta = Math.min(rawDelta, MAX_FRAME_TIME);
    const perspective = camera instanceof PerspectiveCamera ? camera : null;

    const g = glide.current;
    if (g) {
      g.elapsed += delta;
      const t = Math.min(g.elapsed / g.duration, 1);
      const e = easeInOut(t);
      camera.position.lerpVectors(g.fromPosition, g.toPosition, e);
      camera.quaternion.slerpQuaternions(g.fromQuaternion, g.toQuaternion, e);
      if (perspective) {
        perspective.fov = g.fromFov + (g.toFov - g.fromFov) * e;
        perspective.updateProjectionMatrix();
      }
      if (t >= 1) {
        glide.current = null;
        g.done();
      }
      invalidate();
      return;
    }
    if (state.phase !== 'walking') return;

    // Looking: mouse (pointer lock), touch drags, and the left/right arrows.
    const [lx, ly] = state.takeLook();
    const turnKeys = (keys.current.has('ArrowLeft') ? 1 : 0) - (keys.current.has('ArrowRight') ? 1 : 0);
    yaw.current -= mouse.current[0] * MOUSE_LOOK + lx * TOUCH_LOOK - turnKeys * 1.8 * delta;
    pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current - mouse.current[1] * MOUSE_LOOK - ly * TOUCH_LOOK));
    const looked = mouse.current[0] !== 0 || mouse.current[1] !== 0 || lx !== 0 || ly !== 0 || turnKeys !== 0;
    mouse.current = [0, 0];

    // Moving: keys and the joystick, relative to where the walker looks.
    const k = keys.current;
    let forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    forward += state.stick[1];
    strafe += state.stick[0];
    const amount = Math.min(1, Math.hypot(forward, strafe));
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) * amount;
    const heading = amount > 0 ? Math.atan2(strafe, forward) : 0;
    const direction = yaw.current - heading;
    const desired: [number, number] = amount > 0 ? [-Math.sin(direction) * speed, -Math.cos(direction) * speed] : [0, 0];
    const blend = 1 - Math.exp(-ACCELERATION * delta);
    velocity.current = [
      velocity.current[0] + (desired[0] - velocity.current[0]) * blend,
      velocity.current[1] + (desired[1] - velocity.current[1]) * blend,
    ];
    const moving = Math.hypot(...velocity.current) > 0.01;
    if (moving) {
      const result = moveWalker(plan, position.current, [velocity.current[0] * delta, velocity.current[1] * delta]);
      position.current = result.position;
      // Walking into a closed personnel door opens it; an industrial door needs E or the button.
      for (const id of result.bumped) {
        if (plan.doors.find((d) => d.id === id)?.type === 'door') state.openDoor(id);
      }
    } else {
      velocity.current = [0, 0];
    }

    camera.position.copy(eyeAt(position.current));
    camera.quaternion.copy(lookQuaternion(yaw.current, pitch.current));

    const door = doorInReach(plan, position.current, yaw.current);
    state.setReachable(door ? { id: door.id, type: door.type, open: state.open[door.id] !== false } : null);

    poseTimer.current += delta;
    if (poseTimer.current >= POSE_PERIOD || (!moving && !looked)) {
      poseTimer.current = 0;
      const last = state.pose;
      const pose = { x: position.current[0], z: position.current[1], yaw: yaw.current };
      if (!last || last.x !== pose.x || last.z !== pose.z || last.yaw !== pose.yaw) state.setPose(pose);
    }
    if (moving || looked || amount > 0) invalidate();
  });

  return null;
}
