import { describe, expect, it } from 'vitest';
import { computeHallLayout } from './computeHallLayout';
import type { HallParams } from './types';
import { wallPointToWorld } from './walls';
import { buildWalkPlan, doorInReach, floorHeightAt, isInside, moveWalker, WALKER_RADIUS, type P2, type WalkOpening, type WalkPlan } from './walkPlan';

const base: HallParams = { length: 24, width: 12, height: 5, foundation: true, panels: true, insulationMm: 80 };
const layout = computeHallLayout(base);
const front = layout.walls.front;

/** An industrial door in the middle of the front wall, a personnel door on the right wall, a window on the left. */
const openings: WalkOpening[] = [
  { id: 'g', type: 'garageDoor', wallId: front.id, offsetX: front.spanH / 2 - 2, width: 4, height: 4 },
  { id: 'd', type: 'door', wallId: layout.walls.right.id, offsetX: 5, width: 1, height: 2.1 },
  { id: 'w', type: 'window', wallId: layout.walls.left.id, offsetX: 5, width: 1.5, height: 1.2 },
];

/** Walks in a straight line in small steps, like frames would. */
function walk(plan: WalkPlan, from: P2, to: P2, steps = 200) {
  let p = from;
  const bumped = new Set<string>();
  for (let i = 0; i < steps; i++) {
    const r = moveWalker(plan, p, [(to[0] - from[0]) / steps, (to[1] - from[1]) / steps]);
    p = r.position;
    r.bumped.forEach((id) => bumped.add(id));
  }
  return { p, bumped };
}

describe('buildWalkPlan', () => {
  const plan = buildWalkPlan(layout, openings);

  it('spawns inside, in front of the industrial door, looking into the hall', () => {
    expect(isInside(plan, plan.spawn.position)).toBe(true);
    expect(plan.spawn.position[0]).toBeCloseTo(0, 1);
    expect(plan.spawn.position[1]).toBeLessThan(0);
    expect(plan.spawn.position[1]).toBeGreaterThan(-3);
    // Looking towards -Z (into the hall) is yaw 0.
    expect(Math.abs(plan.spawn.yaw)).toBeLessThan(1e-6);
  });

  it('spawns near the front wall middle when there is no door', () => {
    const bare = buildWalkPlan(layout, []);
    expect(isInside(bare, bare.spawn.position)).toBe(true);
    expect(bare.spawn.position[0]).toBeCloseTo(0, 6);
  });

  it('lists the doors (not the window) and the teleport points', () => {
    expect(plan.doors.map((d) => d.id).sort()).toEqual(['d', 'g']);
    const ids = plan.teleports.map((t) => t.id);
    expect(ids).toEqual(['entrance', 'centre', 'door:d', 'corner']);
    expect(plan.teleports[2].label).toBe('Ușa 1');
    for (const t of plan.teleports) expect(isInside(plan, t.position)).toBe(true);
  });

  it('keeps the walker inside the outside limit', () => {
    const { p } = walk(plan, [0, 20], [0, 400]);
    expect(p[1]).toBeLessThanOrEqual(plan.limit.z1 + 1e-9);
  });
});

describe('moveWalker', () => {
  const plan = buildWalkPlan(layout, openings);
  const inner = plan.inside;

  it('cannot cross a solid wall', () => {
    const { p } = walk(plan, [0, -12], [-30, -12]);
    expect(isInside(plan, p)).toBe(true);
    expect(p[0]).toBeGreaterThan(inner.x0 + WALKER_RADIUS - 1e-6);
  });

  it('cannot pass a window', () => {
    // Straight at the middle of the window on the left wall.
    const [, , z] = wallPointToWorld(layout.walls.left, 5.75, 0);
    const { p } = walk(plan, [0, z], [-30, z]);
    expect(isInside(plan, p)).toBe(true);
  });

  it('walks out through an open industrial door', () => {
    const { p } = walk(plan, plan.spawn.position, [0, 10]);
    expect(isInside(plan, p)).toBe(false);
    expect(p[1]).toBeGreaterThan(5);
  });

  it('is stopped by a closed industrial door, without opening it', () => {
    const closed = buildWalkPlan(layout, openings, { g: false });
    const { p, bumped } = walk(closed, closed.spawn.position, [0, 10]);
    expect(isInside(closed, p)).toBe(true);
    expect(bumped.has('g')).toBe(true);
  });

  it('reports a closed personnel door it pushes against', () => {
    const closed = buildWalkPlan(layout, openings, { d: false });
    const door = closed.doors.find((d) => d.id === 'd')!;
    const start: P2 = [door.centre[0] - door.normal[0] * 2, door.centre[1] - door.normal[1] * 2];
    const { p, bumped } = walk(closed, start, [door.centre[0] + door.normal[0] * 3, door.centre[1] + door.normal[1] * 3]);
    expect(isInside(closed, p)).toBe(true);
    expect([...bumped]).toEqual(['d']);
  });

  it('never tunnels through a wall in one long step', () => {
    const r = moveWalker(plan, [0, -12], [-40, 0]);
    expect(isInside(plan, r.position)).toBe(true);
  });

  it('slides along a wall instead of stopping', () => {
    // Pushing diagonally into the right wall still moves along it (between two frames, clear of the columns).
    const start: P2 = [inner.x1 - 0.5, -13];
    const { p } = walk(plan, start, [inner.x1 + 5, -17]);
    expect(p[1]).toBeLessThan(-16.5);
    expect(p[0]).toBeLessThan(inner.x1);
  });

  it('is pushed out of a column', () => {
    const column = layout.columns[2];
    const r = moveWalker(plan, [column.x, column.z], [0, 0]);
    const d = Math.max(Math.abs(r.position[0] - column.x) - 0.15, Math.abs(r.position[1] - column.z) - 0.075);
    expect(d).toBeGreaterThan(WALKER_RADIUS - 1e-6);
  });
});

describe('floorHeightAt', () => {
  const plan = buildWalkPlan(layout, openings);

  it('is the slab inside and the terrain beyond the ramp', () => {
    expect(floorHeightAt(plan, [0, -12])).toBe(layout.slab.topY);
    expect(floorHeightAt(plan, [0, 40])).toBeCloseTo(layout.groundY, 9);
    const edge = plan.slab!.z1;
    const mid = floorHeightAt(plan, [0, edge + 0.3]);
    expect(mid).toBeLessThan(layout.slab.topY);
    expect(mid).toBeGreaterThan(layout.groundY);
  });

  it('is flat without a foundation', () => {
    const flat = buildWalkPlan(computeHallLayout({ ...base, foundation: false }), []);
    expect(flat.slab).toBeNull();
    expect(floorHeightAt(flat, [0, 40])).toBe(flat.floorY);
  });
});

describe('doorInReach', () => {
  const plan = buildWalkPlan(layout, openings);

  it('finds the door the walker faces, within reach', () => {
    const p: P2 = [1.5, -1.5]; // inside, off the door's centre but in front of its width
    expect(doorInReach(plan, p, Math.PI)?.id).toBe('g'); // yaw π looks towards +Z
  });

  it('ignores a door behind the walker or too far away', () => {
    expect(doorInReach(plan, [0, -1.5], 0)).toBeNull();
    expect(doorInReach(plan, [0, -10], Math.PI)).toBeNull();
  });
});
