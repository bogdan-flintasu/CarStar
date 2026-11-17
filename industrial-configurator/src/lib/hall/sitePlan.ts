/**
 * The site around a hall in the quote renders: an asphalt yard with parking bays along the "hero" long wall, the road
 * in front, kerbs, and the areas in front of doors that must stay clear. Pure plan data in world metres (see types.ts
 * for the frame), sized from the layout, so every hall gets a believable site and the same hall always the same site.
 */
import type { HallLayout, LegacyWallId, Side } from './types';
import { heroSide } from './renderViews';
import { wallPointToWorld } from './walls';

/** Axis-aligned rectangle on the ground: x across the hall, z along it. */
export interface SiteRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface SitePlan {
  /** The building and its slab: nothing else goes here. */
  footprint: SiteRect;
  /** Asphalt around the hall. */
  yard: SiteRect;
  /** The road across the front, beyond the yard (it runs off both edges of the picture). */
  road: SiteRect;
  /** Parking bays (5 × 2.5 m), along the hero long wall. */
  bays: SiteRect[];
  /** Kerb lines along the yard's edges (not across its entrance from the road). */
  kerbs: SiteRect[];
  /** In front of every door and industrial door: kept free of parked cars and props. */
  clear: SiteRect[];
  /** The long wall the hero picture shows (bays and most props go there). */
  heroSide: Side;
}

export interface SiteOpening {
  type: string;
  wallId: LegacyWallId;
  offsetX: number;
  width: number;
}

export const BAY = { depth: 5, width: 2.5 } as const;
const FOOTPATH = 1.5;
const AISLE = 6.5;
const FAR_SIDE = 4;
const BACK = 4;
const ROAD_WIDTH = 7.5;
const ROAD_HALF_LENGTH = 400;
const KERB = 0.25;
const MAX_BAYS = 16;
/** How far in front of a doorway stays clear. */
const CLEAR_DEPTH = { garageDoor: 10, door: 3 } as const;

const frontYardDepth = (width: number) => Math.min(22, Math.max(12, width * 0.9));

const overlaps = (a: SiteRect, b: SiteRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

/** The rectangle of ground in front of a doorway, `depth` metres out from its wall. */
function clearZone(layout: HallLayout, opening: SiteOpening, depth: number): SiteRect | null {
  const wall = Object.values(layout.walls).find((w) => w.id === opening.wallId);
  if (!wall) return null;
  const a = wallPointToWorld(wall, opening.offsetX - 0.5, 0);
  const b = wallPointToWorld(wall, opening.offsetX + opening.width + 0.5, 0);
  const c = wallPointToWorld(wall, opening.offsetX, 0, depth);
  const xs = [a[0], b[0], c[0]];
  const zs = [a[2], b[2], c[2]];
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

export function planSite(layout: HallLayout, openings: readonly SiteOpening[] = []): SitePlan {
  const { min, max } = layout.bounds;
  const slab = layout.params.foundation ? layout.slab : null;
  const footprint: SiteRect = {
    x0: Math.min(min[0], slab ? slab.centerX - slab.w / 2 : Infinity),
    x1: Math.max(max[0], slab ? slab.centerX + slab.w / 2 : -Infinity),
    z0: Math.min(min[2], slab ? slab.centerZ - slab.l / 2 : Infinity),
    z1: Math.max(max[2], slab ? slab.centerZ + slab.l / 2 : -Infinity),
  };

  const hero = heroSide(layout);
  const heroDepth = FOOTPATH + BAY.depth + AISLE;
  const yard: SiteRect = {
    x0: footprint.x0 - (hero === 'left' ? heroDepth : FAR_SIDE),
    x1: footprint.x1 + (hero === 'right' ? heroDepth : FAR_SIDE),
    z0: footprint.z0 - BACK,
    z1: footprint.z1 + frontYardDepth(layout.params.width),
  };
  const road: SiteRect = { x0: -ROAD_HALF_LENGTH, x1: ROAD_HALF_LENGTH, z0: yard.z1, z1: yard.z1 + ROAD_WIDTH };

  const clear = openings.flatMap((o) => {
    const depth = o.type === 'garageDoor' ? CLEAR_DEPTH.garageDoor : o.type === 'door' ? CLEAR_DEPTH.door : 0;
    const zone = depth > 0 ? clearZone(layout, o, depth) : null;
    return zone ? [zone] : [];
  });

  // Bays perpendicular to the hero wall, past a footpath, from the front corner backwards.
  const bays: SiteRect[] = [];
  const inner = hero === 'left' ? footprint.x0 - FOOTPATH : footprint.x1 + FOOTPATH;
  const [bx0, bx1] = hero === 'left' ? [inner - BAY.depth, inner] : [inner, inner + BAY.depth];
  for (let z1 = footprint.z1 - 1; z1 - BAY.width >= footprint.z0 + 1 && bays.length < MAX_BAYS; z1 -= BAY.width) {
    const bay = { x0: bx0, x1: bx1, z0: z1 - BAY.width, z1 };
    // Doorways on the hero wall need their clear zone; their own bays are left out (the line pattern continues).
    if (!clear.some((zone) => overlaps(zone, bay))) bays.push(bay);
  }

  // Kerbs on the back and the two sides of the yard; the front is the entrance from the road.
  const kerbs: SiteRect[] = [
    { x0: yard.x0 - KERB, x1: yard.x1 + KERB, z0: yard.z0 - KERB, z1: yard.z0 },
    { x0: yard.x0 - KERB, x1: yard.x0, z0: yard.z0, z1: yard.z1 },
    { x0: yard.x1, x1: yard.x1 + KERB, z0: yard.z0, z1: yard.z1 },
  ];

  return { footprint, yard, road, bays, kerbs, clear, heroSide: hero };
}
