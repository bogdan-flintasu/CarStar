/**
 * Where the props of a quote render go: parked cars, a delivery van, two workers, a forklift with pallets, trees and
 * bushes around the yard, and neighbouring buildings and tree lines on the horizon. Pure and deterministic: the seed
 * comes from the hall itself, so the same hall always gets the same scene, and no prop stands on the building, on the
 * road, or in front of a door.
 */
import type { SitePlan, SiteRect } from './sitePlan';

export type PropKind = 'car' | 'van' | 'worker' | 'forklift' | 'pallets' | 'tree' | 'bush' | 'building';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  /** Rotation about +Y, radians. 0 = the model's long axis along +Z. */
  rotation: number;
  /** Which model / tree shape / building colour (see the render layer). */
  variant: number;
  /** Uniform size factor around the model's real size. */
  scale: number;
  /** Buildings: footprint and height in metres. */
  size?: { w: number; d: number; h: number };
}

/** Footprints used for collision checks (metres, long axis first). */
export const PROP_FOOTPRINT: Record<PropKind, [number, number]> = {
  car: [4.6, 2],
  van: [5.4, 2.1],
  worker: [0.7, 0.7],
  forklift: [3.6, 1.4],
  pallets: [1.4, 1.4],
  tree: [3, 3],
  bush: [1.6, 1.6],
  building: [0, 0],
};

export const CAR_VARIANTS = 8;
/** Tree species (see TREE_SHAPES in the render layer): round, large broad, poplar, young, multi-crown, cypress. */
export const TREE_VARIANTS = 6;
/** Crown radius of each species at scale 1 (metres): trees take this much ground. */
export const TREE_CROWN = [2.7, 6, 1.5, 1.6, 2.75, 2.2] as const;
const NEAR_TREES = [0, 0, 0, 1, 2, 3, 3, 4, 4, 5] as const;
const FAR_TREES = [0, 1, 1, 1, 2, 4, 5, 5] as const;
export const BUILDING_VARIANTS = 4;

/** Mulberry32: small, fast, deterministic. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the site's size: the same hall, the same scene. */
export function siteSeed(plan: SitePlan): number {
  const f = plan.footprint;
  return Math.round((f.x1 - f.x0) * 1000) * 7919 + Math.round((f.z1 - f.z0) * 1000) * 104729 + (plan.heroSide === 'left' ? 1 : 2);
}

const overlaps = (a: SiteRect, b: SiteRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const grow = (r: SiteRect, by: number): SiteRect => ({ x0: r.x0 - by, x1: r.x1 + by, z0: r.z0 - by, z1: r.z1 + by });

/** The ground a prop covers, as an axis-aligned box (rotations are multiples of 90° for everything but trees). */
export function propRect(p: Prop): SiteRect {
  if (p.kind === 'building' && p.size) {
    return { x0: p.x - p.size.w / 2, x1: p.x + p.size.w / 2, z0: p.z - p.size.d / 2, z1: p.z + p.size.d / 2 };
  }
  if (p.kind === 'tree') {
    const r = TREE_CROWN[p.variant % TREE_CROWN.length] * p.scale;
    return { x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r };
  }
  const [long, short] = PROP_FOOTPRINT[p.kind].map((v) => v * p.scale);
  const alongZ = Math.abs(Math.cos(p.rotation)) > Math.SQRT1_2;
  const [w, d] = alongZ ? [short, long] : [long, short];
  return { x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - d / 2, z1: p.z + d / 2 };
}

type P2 = [number, number];

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
function hull(points: P2[]): P2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P2[]) => {
    const out: P2[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function insideConvex(polygon: P2[], [x, z]: P2): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    if ((bx - ax) * (z - az) - (bz - az) * (x - ax) < 0) return false;
  }
  return true;
}

/**
 * The ground between a camera and the hall: the hull of the camera's ground position and the footprint, grown by
 * `margin`. Anything tall standing in it would hide the building.
 */
export function sightWedge(camera: P2, footprint: SiteRect, margin = 2): P2[] {
  const f = grow(footprint, margin);
  return hull([camera, [f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]]);
}

/**
 * The props of the site. `viewpoints` are the ground positions (x, z) of the render cameras: trees, bushes and
 * buildings that would stand between one of them and the hall are left out.
 */
export function planProps(plan: SitePlan, viewpoints: readonly P2[] = []): Prop[] {
  const random = seededRandom(siteSeed(plan));
  const props: Prop[] = [];
  const { footprint: f, yard, road, heroSide } = plan;
  const hero = heroSide === 'left' ? -1 : 1;
  const blocked = [grow(f, 0.4), road, ...plan.clear];
  const free = (p: Prop, margin = 0.3) => {
    const r = grow(propRect(p), margin);
    return !blocked.some((b) => overlaps(b, r)) && !props.some((q) => q.kind !== 'building' && overlaps(propRect(q), r));
  };
  const inYard = (p: Prop) => {
    const r = propRect(p);
    return r.x0 >= yard.x0 && r.x1 <= yard.x1 && r.z0 >= yard.z0 && r.z1 <= yard.z1;
  };
  /** Places `p`, sliding it along x (away from the hero side first) until it is free; skips it if it never is. */
  const place = (p: Prop, slide = 1) => {
    for (let step = 0; step < 40; step++) {
      const candidate = { ...p, x: p.x + slide * step * 0.5 };
      if (inYard(candidate) && free(candidate)) {
        props.push(candidate);
        return true;
      }
    }
    return false;
  };

  // Parked cars: about half the bays, at least two, nose to the wall or to the aisle.
  const bayCount = plan.bays.length;
  const wanted = Math.min(6, Math.max(Math.min(2, bayCount), Math.round(bayCount * 0.45)));
  // Seeded Fisher-Yates (a random sort comparator would order differently in different browsers).
  const shuffled = plan.bays.map((_, i) => i);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const order = shuffled.slice(0, wanted).sort((a, b) => a - b);
  for (const i of order) {
    const bay = plan.bays[i];
    const car: Prop = {
      kind: 'car',
      x: (bay.x0 + bay.x1) / 2,
      z: (bay.z0 + bay.z1) / 2,
      rotation: (random() < 0.5 ? 1 : -1) * (Math.PI / 2),
      variant: Math.floor(random() * CAR_VARIANTS),
      scale: 1,
    };
    if (free(car, 0)) props.push(car);
  }

  const frontDepth = yard.z1 - f.z1;
  const heroEdge = hero < 0 ? f.x0 : f.x1;
  const farEdge = hero < 0 ? f.x1 : f.x0;

  // Two workers talking near the hero front corner, facing each other.
  const wx = heroEdge - hero * 1.5;
  const wz = f.z1 + Math.min(4, frontDepth * 0.35);
  place({ kind: 'worker', x: wx, z: wz, rotation: -hero * (Math.PI / 2), variant: 0, scale: 1 }, -hero);
  place({ kind: 'worker', x: wx - hero * 1.1, z: wz + 0.4, rotation: hero * (Math.PI / 2) + 0.4, variant: 1, scale: 1 }, -hero);

  // Forklift and pallets at the far front corner, by the wall.
  const fz = f.z1 + 2.4;
  if (place({ kind: 'forklift', x: farEdge + hero * 3, z: fz, rotation: hero * (Math.PI / 2), variant: 0, scale: 1 }, hero)) {
    const lift = props[props.length - 1];
    place({ kind: 'pallets', x: lift.x - hero * 3.2, z: fz - 0.2, rotation: 0, variant: 2, scale: 1 }, -hero);
    place({ kind: 'pallets', x: lift.x - hero * 4.8, z: fz + 0.1, rotation: 0.1, variant: 1, scale: 1 }, -hero);
  }

  // Delivery van in the front yard, parallel to the road.
  place({ kind: 'van', x: (f.x0 + f.x1) / 2 - hero * (f.x1 - f.x0) * 0.2, z: f.z1 + frontDepth * 0.62, rotation: Math.PI / 2, variant: 0, scale: 1 }, -hero);

  // Trees and bushes on the grass around the yard (not along the road).
  const kerbGap = 2.2;
  const lines: { from: [number, number]; to: [number, number] }[] = [
    { from: [yard.x0 - kerbGap, yard.z1 - 4], to: [yard.x0 - kerbGap, yard.z0 - kerbGap] },
    { from: [yard.x0 - kerbGap, yard.z0 - kerbGap], to: [yard.x1 + kerbGap, yard.z0 - kerbGap] },
    { from: [yard.x1 + kerbGap, yard.z0 - kerbGap], to: [yard.x1 + kerbGap, yard.z1 - 4] },
  ];
  const pickFrom = (list: readonly number[]) => list[Math.floor(random() * list.length)];
  const roadSafe = (t: Prop) => {
    const r = propRect(t);
    return r.z1 < road.z0 - 1 || r.z0 > road.z1 + 1;
  };
  let trees = 0;
  for (const line of lines) {
    const length = Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]);
    const count = Math.max(1, Math.round(length / 6));
    for (let i = 0; i <= count && trees < 60; i++) {
      const t = i / count;
      const x = line.from[0] + (line.to[0] - line.from[0]) * t;
      const z = line.from[1] + (line.to[1] - line.from[1]) * t;
      if (random() < 0.15) continue; // gaps make the row look planted, not generated
      // Trees stand back from the kerb by their own crown, so big ones do not hang over the yard.
      const variant = pickFrom(NEAR_TREES);
      const scale = 0.85 + random() * 0.6;
      const out = TREE_CROWN[variant] * scale * 0.6;
      const tree: Prop = {
        kind: 'tree',
        // Pushed outwards: away from the yard sideways on the side rows, backwards on the back row.
        x: x + (random() - 0.5) * 1.5 + (line.from[1] === line.to[1] ? 0 : x < (yard.x0 + yard.x1) / 2 ? -out : out),
        z: z + (random() - 0.5) * 1.5 - (line.from[1] === line.to[1] ? out : 0),
        rotation: random() * Math.PI * 2,
        variant,
        scale,
      };
      if (!roadSafe(tree)) continue;
      props.push(tree);
      trees++;
      // A couple of bushes between trees.
      for (let k = 1; k <= 2; k++) {
        const s = t + (k / 3) / count;
        if (s >= 1) continue;
        props.push({ kind: 'bush', x: line.from[0] + (line.to[0] - line.from[0]) * s, z: line.from[1] + (line.to[1] - line.from[1]) * s, rotation: random() * Math.PI, variant: Math.floor(random() * 3), scale: 0.75 + random() * 0.5 });
      }
    }
  }

  // The surroundings: a belt of tree clumps, some of them big, which screens most of the horizon, and a few neighbouring
  // units behind it. Everything well away from the site and the road.
  const cx = (yard.x0 + yard.x1) / 2;
  const cz = (yard.z0 + yard.z1) / 2;
  const reach = Math.hypot(yard.x1 - yard.x0, yard.z1 - yard.z0) / 2;
  const clearOfRoad = (z: number, half: number) => z - half > road.z1 + 8 || z + half < road.z0 - 8;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + random() * 0.4;
    const radius = reach + 130 + random() * 120;
    const size = { w: 16 + random() * 30, d: 14 + random() * 40, h: 6 + random() * 5 };
    const z = cz + Math.sin(angle) * radius;
    if (!clearOfRoad(z, size.d / 2)) continue;
    props.push({ kind: 'building', x: cx + Math.cos(angle) * radius, z, rotation: 0, variant: Math.floor(random() * BUILDING_VARIANTS), scale: 1, size });
  }
  const clumps = 26;
  for (let c = 0; c < clumps; c++) {
    const angle = (c / clumps) * Math.PI * 2 + (random() - 0.5) * 0.3;
    const radius = reach + 22 + random() * 90;
    const clumpX = cx + Math.cos(angle) * radius;
    const clumpZ = cz + Math.sin(angle) * radius;
    const members = 6 + Math.floor(random() * 9);
    for (let m = 0; m < members; m++) {
      const variant = pickFrom(FAR_TREES);
      const tree: Prop = {
        kind: 'tree',
        x: clumpX + (random() - 0.5) * 26,
        z: clumpZ + (random() - 0.5) * 26,
        rotation: random() * Math.PI * 2,
        variant,
        scale: 1.1 + random() * 1.1,
      };
      const r = propRect(tree);
      if (!clearOfRoad(tree.z, (r.z1 - r.z0) / 2) || overlaps(r, grow(yard, 3))) continue;
      if (props.some((p) => p.kind === 'building' && overlaps(propRect(p), r))) continue;
      props.push(tree);
    }
  }

  const wedges = viewpoints.map((v) => sightWedge(v, plan.footprint));
  const tall = new Set<PropKind>(['tree', 'bush', 'building']);
  return props.filter((p) => !tall.has(p.kind) || !wedges.some((w) => {
    const r = propRect(p);
    const corners: P2[] = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [p.x, p.z]];
    return corners.some((c) => insideConvex(w, c));
  }));
}
