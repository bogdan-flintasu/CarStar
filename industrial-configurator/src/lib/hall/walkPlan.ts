/**
 * The walk-through's world as the walker feels it (docs/plans/walkthrough.md, "Collision"): a small 2D model on the
 * ground plane (x across the hall, z along it), built from the HallLayout and the openings, never from the meshes.
 *
 *  - Every wall is a solid segment on the middle of its cladding, `thickness / 2` thick on each side.
 *  - A door or industrial door cuts a gap in its wall's segment while it is open; a closed one fills the gap with a
 *    segment that remembers which door it is (so walking into a personnel door can open it). Windows never cut a gap.
 *  - Columns are solid rectangles of the column section.
 *  - Outside, the walker stays inside a limit around the hall.
 *  - The floor is the slab inside the slab's outline and the terrain outside it, with a short ramp at the edge.
 *
 * Pure, no three.js: unit-tested in walkPlan.test.ts.
 */
import { COLUMN_DEPTH, FRAME_FLANGE_WIDTH } from './constants';
import type { HallLayout, LegacyWallId, WallDescriptor } from './types';
import { wallPointToWorld } from './walls';

export type P2 = readonly [number, number];

/** What the walk plan needs to know about an opening (a subset of the openings store's `Opening`). */
export interface WalkOpening {
  id: string;
  type: 'window' | 'door' | 'garageDoor';
  wallId: LegacyWallId;
  offsetX: number;
  width: number;
  height: number;
}

/** The walker: a circle on the ground. */
export const WALKER_RADIUS = 0.22;
/** Eye height above the floor (metres). */
export const EYE_HEIGHT = 1.7;
/** Walking and running speeds (m/s). */
export const WALK_SPEED = 1.5;
export const RUN_SPEED = 4;
/** How far the walker may wander from the hall's outline outside. */
const OUTSIDE_MARGIN = 15;
/** Length of the ramp from the slab down to the terrain. */
const RAMP = 0.6;
/** Spawn and teleport points stand this far inside a doorway. */
const INSIDE_DOOR = 1.6;
/** A door can be toggled from this far away, if the walker looks roughly at it. */
export const DOOR_REACH = 3;
/** Largest step checked in one go: a fast move is split, so nothing thin is passed through. */
const MAX_STEP = 0.08;
const ITERATIONS = 4;

export interface WalkSegment {
  a: P2;
  b: P2;
  /** Half the solid's thickness: the walker keeps `WALKER_RADIUS + half` from the line. */
  half: number;
  /** Set on the segment that closes a doorway. */
  doorId?: string;
}

export interface WalkBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface WalkDoor {
  id: string;
  type: 'door' | 'garageDoor';
  wallId: LegacyWallId;
  /** Doorway centre on the wall's middle line. */
  centre: P2;
  /** Outward unit normal of the wall (x, z). */
  normal: P2;
  width: number;
  height: number;
}

export interface WalkPoint {
  id: string;
  label: string;
  position: P2;
  /** Direction the walker looks on arrival: radians about +Y, 0 = towards -Z (three.js camera default). */
  yaw: number;
}

export interface WalkPlan {
  segments: WalkSegment[];
  boxes: WalkBox[];
  doors: WalkDoor[];
  /** The walker never leaves this rectangle. */
  limit: WalkBox;
  /** The slab's outline (the floor), or null without a foundation. */
  slab: WalkBox | null;
  floorY: number;
  groundY: number;
  /** The inside of the hall, between the walls' inner faces. */
  inside: WalkBox;
  spawn: WalkPoint;
  teleports: WalkPoint[];
}

const xz = (p: readonly [number, number, number]): P2 => [p[0], p[2]];

/** Yaw that looks along the ground direction (dx, dz). three.js cameras look down -Z at yaw 0. */
export function yawTowards(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** The point at `h` along a wall's middle line, `inward` metres further in from it. */
function wallPoint(wall: WallDescriptor, h: number, inward = 0): P2 {
  return xz(wallPointToWorld(wall, h, 0, -wall.thickness / 2 - inward));
}

const isDoor = (o: WalkOpening): o is WalkOpening & { type: 'door' | 'garageDoor' } => o.type === 'door' || o.type === 'garageDoor';

/**
 * Builds the walk plan of a hall. `open` says which doors are open (by opening id); a door missing from it is open,
 * so a freshly entered hall is never a closed box.
 */
export function buildWalkPlan(layout: HallLayout, openings: readonly WalkOpening[], open: Readonly<Record<string, boolean>> = {}): WalkPlan {
  const segments: WalkSegment[] = [];
  const doors: WalkDoor[] = [];

  for (const wall of Object.values(layout.walls)) {
    const half = wall.thickness / 2;
    // Cut out every doorway of this wall, in order along `h`.
    const gaps = openings
      .filter((o) => o.wallId === wall.id && isDoor(o))
      .map((o) => ({ o, h0: Math.max(0, o.offsetX), h1: Math.min(wall.spanH, o.offsetX + o.width) }))
      .filter((g) => g.h1 > g.h0)
      .sort((p, q) => p.h0 - q.h0);
    // A little past both ends, so the corners close whatever the end walls' exact overlap.
    let from = -wall.thickness;
    for (const { o, h0, h1 } of gaps) {
      if (h0 > from) segments.push({ a: wallPoint(wall, from), b: wallPoint(wall, h0), half });
      if (open[o.id] === false) segments.push({ a: wallPoint(wall, h0), b: wallPoint(wall, h1), half, doorId: o.id });
      from = Math.max(from, h1);
      doors.push({
        id: o.id,
        type: o.type as WalkDoor['type'],
        wallId: wall.id,
        centre: wallPoint(wall, (h0 + h1) / 2),
        normal: [wall.normal[0], wall.normal[2]],
        width: h1 - h0,
        height: o.height,
      });
    }
    const end = wall.spanH + wall.thickness;
    if (end > from) segments.push({ a: wallPoint(wall, from), b: wallPoint(wall, end), half });
  }

  const boxes: WalkBox[] = layout.columns.map((c) => ({
    x0: c.x - COLUMN_DEPTH / 2,
    x1: c.x + COLUMN_DEPTH / 2,
    z0: c.z - FRAME_FLANGE_WIDTH / 2,
    z1: c.z + FRAME_FLANGE_WIDTH / 2,
  }));

  const { min, max } = layout.bounds;
  const limit: WalkBox = { x0: min[0] - OUTSIDE_MARGIN, x1: max[0] + OUTSIDE_MARGIN, z0: min[2] - OUTSIDE_MARGIN, z1: max[2] + OUTSIDE_MARGIN };
  const s = layout.slab;
  const slab = layout.params.foundation ? { x0: s.centerX - s.w / 2, x1: s.centerX + s.w / 2, z0: s.centerZ - s.l / 2, z1: s.centerZ + s.l / 2 } : null;

  const left = layout.walls.left;
  const right = layout.walls.right;
  const front = layout.walls.front;
  const back = layout.walls.back;
  const inside: WalkBox = {
    x0: wallPoint(left, 0, left.thickness / 2)[0],
    x1: wallPoint(right, 0, right.thickness / 2)[0],
    z0: wallPoint(back, 0, back.thickness / 2)[1],
    z1: wallPoint(front, 0, front.thickness / 2)[1],
  };

  const centre: P2 = [(inside.x0 + inside.x1) / 2, (inside.z0 + inside.z1) / 2];
  /** `index`: the door's number among the doors of its kind, from 1. */
  const doorPoint = (door: WalkDoor, index: number): WalkPoint => {
    const p: P2 = [door.centre[0] - door.normal[0] * INSIDE_DOOR, door.centre[1] - door.normal[1] * INSIDE_DOOR];
    const label = door.type === 'garageDoor' ? `Ușa industrială ${index}` : `Ușa ${index}`;
    return { id: `door:${door.id}`, label, position: p, yaw: yawTowards(-door.normal[0], -door.normal[1]) };
  };

  // Main door: the widest industrial door, else the widest door; front walls win ties.
  const ranked = [...doors].sort((p, q) => (q.type === 'garageDoor' ? 1 : 0) - (p.type === 'garageDoor' ? 1 : 0) || q.width - p.width);
  const main = ranked[0];
  const towardsCentre = (p: P2) => yawTowards(centre[0] - p[0], centre[1] - p[1]);
  const spawn: WalkPoint = main
    ? { ...doorPoint(main, 1), id: 'entrance', label: 'Intrare', yaw: yawTowards(-main.normal[0], -main.normal[1]) }
    : { id: 'entrance', label: 'Intrare', position: [centre[0], inside.z1 - INSIDE_DOOR], yaw: 0 };

  const teleports: WalkPoint[] = [spawn, { id: 'centre', label: 'Centru', position: centre, yaw: spawn.yaw }];
  let garage = 0;
  let personnel = 0;
  for (const door of doors) {
    if (door === main) continue;
    teleports.push(doorPoint(door, door.type === 'garageDoor' ? ++garage : ++personnel));
  }
  // The corner of the hall farthest from the entrance, looking back across the hall.
  const inset = 1.2;
  const corners: P2[] = [
    [inside.x0 + inset, inside.z0 + inset],
    [inside.x1 - inset, inside.z0 + inset],
    [inside.x0 + inset, inside.z1 - inset],
    [inside.x1 - inset, inside.z1 - inset],
  ];
  const far = corners.reduce((best, c) => (dist(c, spawn.position) > dist(best, spawn.position) ? c : best));
  teleports.push({ id: 'corner', label: 'Colțul opus', position: far, yaw: towardsCentre(far) });

  return { segments, boxes, doors, limit, slab, floorY: layout.slab.topY, groundY: layout.groundY, inside, spawn, teleports };
}

function dist(a: P2, b: P2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function closestOnSegment(p: P2, a: P2, b: P2): P2 {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
  return [a[0] + t * dx, a[1] + t * dz];
}

export interface MoveResult {
  position: P2;
  /** Closed personnel doors the walker pushed against. */
  bumped: string[];
}

/**
 * Moves the walker from `from` by `delta`, sliding along whatever it touches. Long moves are split into short steps,
 * so the walker never tunnels through a wall, however fast the frame.
 */
export function moveWalker(plan: WalkPlan, from: P2, delta: P2, radius = WALKER_RADIUS): MoveResult {
  const length = Math.hypot(delta[0], delta[1]);
  const steps = Math.max(1, Math.ceil(length / MAX_STEP));
  let x = from[0];
  let z = from[1];
  const bumped = new Set<string>();
  for (let i = 0; i < steps; i++) {
    x += delta[0] / steps;
    z += delta[1] / steps;
    for (let k = 0; k < ITERATIONS; k++) {
      let pushed = false;
      for (const s of plan.segments) {
        const reach = radius + s.half;
        // Cheap reject on the segment's bounding box.
        if (x < Math.min(s.a[0], s.b[0]) - reach || x > Math.max(s.a[0], s.b[0]) + reach) continue;
        if (z < Math.min(s.a[1], s.b[1]) - reach || z > Math.max(s.a[1], s.b[1]) + reach) continue;
        const c = closestOnSegment([x, z], s.a, s.b);
        const dx = x - c[0];
        const dz = z - c[1];
        const d = Math.hypot(dx, dz);
        if (d >= reach) continue;
        if (s.doorId) bumped.add(s.doorId);
        if (d > 1e-9) {
          x = c[0] + (dx / d) * reach;
          z = c[1] + (dz / d) * reach;
        } else {
          // Exactly on the line: step back the way we came.
          const back = Math.hypot(delta[0], delta[1]) || 1;
          x -= (delta[0] / back) * reach;
          z -= (delta[1] / back) * reach;
        }
        pushed = true;
      }
      for (const b of plan.boxes) {
        if (x < b.x0 - radius || x > b.x1 + radius || z < b.z0 - radius || z > b.z1 + radius) continue;
        const cx = Math.max(b.x0, Math.min(b.x1, x));
        const cz = Math.max(b.z0, Math.min(b.z1, z));
        const dx = x - cx;
        const dz = z - cz;
        const d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d > 1e-9) {
          x = cx + (dx / d) * radius;
          z = cz + (dz / d) * radius;
        } else {
          // Inside the box: out through the nearest side.
          const exits = [b.x0 - radius - x, b.x1 + radius - x, b.z0 - radius - z, b.z1 + radius - z];
          const i = exits.reduce((best, v, j) => (Math.abs(v) < Math.abs(exits[best]) ? j : best), 0);
          if (i < 2) x += exits[i];
          else z += exits[i];
        }
        pushed = true;
      }
      if (!pushed) break;
    }
    const l = plan.limit;
    x = Math.max(l.x0, Math.min(l.x1, x));
    z = Math.max(l.z0, Math.min(l.z1, z));
  }
  return { position: [x, z], bumped: [...bumped] };
}

/** Height of the floor under a point: the slab, the terrain, and a short ramp between them. */
export function floorHeightAt(plan: WalkPlan, p: P2): number {
  if (!plan.slab) return plan.floorY;
  const s = plan.slab;
  const dx = Math.max(s.x0 - p[0], 0, p[0] - s.x1);
  const dz = Math.max(s.z0 - p[1], 0, p[1] - s.z1);
  const outside = Math.hypot(dx, dz);
  if (outside <= 0) return plan.floorY;
  const t = Math.min(1, outside / RAMP);
  return plan.floorY + (plan.groundY - plan.floorY) * t;
}

/** Whether a point is inside the hall's walls. */
export function isInside(plan: WalkPlan, p: P2): boolean {
  const b = plan.inside;
  return p[0] > b.x0 && p[0] < b.x1 && p[1] > b.z0 && p[1] < b.z1;
}

/**
 * The door the walker can toggle: the nearest one within reach that lies roughly in front of them (within 60° of the
 * view direction), or null.
 */
export function doorInReach(plan: WalkPlan, p: P2, yaw: number): WalkDoor | null {
  const look: P2 = [-Math.sin(yaw), -Math.cos(yaw)];
  let best: WalkDoor | null = null;
  let bestDistance = Infinity;
  for (const door of plan.doors) {
    // Distance to the doorway's line, not just its centre: a wide industrial door is reachable along its width.
    const along: P2 = [-door.normal[1], door.normal[0]];
    const a: P2 = [door.centre[0] - along[0] * (door.width / 2), door.centre[1] - along[1] * (door.width / 2)];
    const b: P2 = [door.centre[0] + along[0] * (door.width / 2), door.centre[1] + along[1] * (door.width / 2)];
    const c = closestOnSegment(p, a, b);
    const d = dist(p, c);
    if (d > DOOR_REACH || d >= bestDistance) continue;
    const towards = d > 1e-6 ? [(c[0] - p[0]) / d, (c[1] - p[1]) / d] : look;
    if (towards[0] * look[0] + towards[1] * look[1] < 0.5) continue;
    best = door;
    bestDistance = d;
  }
  return best;
}
