'use client';

/**
 * The ground of the quote renders, built from a SitePlan (src/lib/hall/sitePlan.ts): textured grass, an asphalt yard
 * and road with white markings, and concrete kerbs. Plain three.js objects, added to the scene only while a picture
 * is drawn. Textures are generated or loaded once and shared.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import type { SitePlan, SiteRect } from '@/lib/hall/sitePlan';

const GRASS_SIZE = 2000;
const GRASS_TILE = 4;
const ASPHALT_TILE = 14;
const LINE = 0.12;
const KERB_HEIGHT = 0.14;

/** Small deterministic PRNG (mulberry32): the same asphalt grain in every picture. */
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

/** Asphalt grain: mid-grey speckles, a few lighter stones and soft darker patches. */
function asphaltTexture(): Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const random = seededRandom(7);
  context.fillStyle = '#4a4c50';
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    const r = 30 + random() * 90;
    const g = context.createRadialGradient(random() * size, random() * size, 0, random() * size, random() * size, r);
    g.addColorStop(0, `rgba(30,31,34,${0.03 + random() * 0.05})`);
    g.addColorStop(1, 'rgba(30,31,34,0)');
    context.fillStyle = g;
    context.fillRect(0, 0, size, size);
  }
  const image = context.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const stone = random() < 0.012 ? 40 : 0;
    const n = (random() - 0.5) * 34 + stone;
    image.data[i] += n;
    image.data[i + 1] += n;
    image.data[i + 2] += n;
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Name of the materials kept between batches (not disposed with a site). */
const SHARED = 'render-site-shared';

/** Smooth value noise in [0, 1] on a grid of `cells`, from a seed. */
function valueNoise(cells: number, seed: number): (u: number, v: number) => number {
  const random = seededRandom(seed);
  const grid = Array.from({ length: (cells + 1) * (cells + 1) }, random);
  const at = (i: number, j: number) => grid[j * (cells + 1) + i];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const i = Math.min(cells - 1, Math.floor(x));
    const j = Math.min(cells - 1, Math.floor(y));
    const fx = smooth(x - i);
    const fy = smooth(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/**
 * The lawn: a large plane whose vertex colours vary in patches of a few metres to tens of metres (drier and lusher
 * grass), so it does not read as one repeated tile.
 */
function lawnGeometry(): PlaneGeometry {
  const segments = 240;
  const geometry = new PlaneGeometry(GRASS_SIZE, GRASS_SIZE, segments, segments);
  const uv = geometry.getAttribute('uv');
  const broad = valueNoise(60, 11);
  const fine = valueNoise(400, 23);
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    const n = broad(uv.getX(i), uv.getY(i)) * 0.65 + fine(uv.getX(i), uv.getY(i)) * 0.35;
    // Lush (darker, greener) to dry (lighter, yellower).
    colors[i * 3] = 0.7 + n * 0.45;
    colors[i * 3 + 1] = 0.78 + n * 0.3;
    colors[i * 3 + 2] = 0.72 + n * 0.12;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

let shared: Promise<{ grass: MeshStandardMaterial; asphalt: Texture }> | null = null;

function sharedTextures() {
  shared ??= (async () => {
    const loader = new TextureLoader();
    const [map, normalMap, roughnessMap] = await Promise.all(
      ['/grass/grass_color.webp', '/grass/grass_normal.webp', '/grass/grass_roughness.webp'].map((url) => loader.loadAsync(url)),
    );
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.setScalar(GRASS_SIZE / GRASS_TILE);
      t.anisotropy = 8;
    }
    map.colorSpace = SRGBColorSpace;
    // Slightly muted: the colour grade adds saturation, and a lawn is never neon green.
    const grass = new MeshStandardMaterial({ map, normalMap, roughnessMap, color: '#c2bb93', vertexColors: true, name: SHARED });
    return { grass, asphalt: asphaltTexture() };
  })();
  shared.catch(() => (shared = null));
  return shared;
}

/** A flat rectangle at height `y`, lifted over what is under it by a polygon offset (no z-fighting far away). */
function flat(rect: SiteRect, y: number, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new PlaneGeometry(rect.x1 - rect.x0, rect.z1 - rect.z0), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

function box(rect: SiteRect, y: number, height: number, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new BoxGeometry(rect.x1 - rect.x0, height, rect.z1 - rect.z0), material);
  mesh.position.set((rect.x0 + rect.x1) / 2, y + height / 2, (rect.z0 + rect.z1) / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Outline of a parking bay: its two long sides and the end at the aisle. */
function bayLines(bay: SiteRect, hero: 'left' | 'right'): SiteRect[] {
  const aisleX = hero === 'left' ? bay.x0 : bay.x1;
  return [
    { x0: bay.x0, x1: bay.x1, z0: bay.z0 - LINE / 2, z1: bay.z0 + LINE / 2 },
    { x0: bay.x0, x1: bay.x1, z0: bay.z1 - LINE / 2, z1: bay.z1 + LINE / 2 },
    { x0: aisleX - LINE / 2, x1: aisleX + LINE / 2, z0: bay.z0, z1: bay.z1 },
  ];
}

/** The site's ground as a group, at terrain level `groundY`. */
export async function buildSite(plan: SitePlan, groundY: number): Promise<Group> {
  const { grass, asphalt } = await sharedTextures();
  const group = new Group();
  group.name = 'RenderSite';

  const lift = (factor: number): Partial<MeshStandardMaterial> => ({ polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor });
  const yardMap = asphalt.clone();
  const yardMaterial = new MeshStandardMaterial({ map: yardMap, roughness: 0.93, metalness: 0, ...lift(-1) });
  const road = new MeshStandardMaterial({ map: asphalt.clone(), color: '#d6d6d6', roughness: 0.9, metalness: 0, ...lift(-1) });
  const paint = new MeshStandardMaterial({ color: '#f1f1ec', roughness: 0.55, metalness: 0, ...lift(-3) });
  const kerb = new MeshStandardMaterial({ color: '#bdbab3', roughness: 0.85, metalness: 0 });
  for (const [material, rect] of [[yardMaterial, plan.yard], [road, plan.road]] as const) {
    material.map!.repeat.set((rect.x1 - rect.x0) / ASPHALT_TILE, (rect.z1 - rect.z0) / ASPHALT_TILE);
  }

  const grassPlane = new Mesh(lawnGeometry(), grass);
  grassPlane.rotation.x = -Math.PI / 2;
  grassPlane.position.y = groundY - 0.02;
  grassPlane.receiveShadow = true;
  group.add(grassPlane, flat(plan.yard, groundY, yardMaterial), flat(plan.road, groundY, road));

  const markings: SiteRect[] = plan.bays.flatMap((bay) => bayLines(bay, plan.heroSide));
  // Road: edge lines and a dashed centre line.
  const { road: r } = plan;
  const middle = (r.z0 + r.z1) / 2;
  markings.push({ x0: r.x0, x1: r.x1, z0: r.z0 + 0.3, z1: r.z0 + 0.3 + LINE }, { x0: r.x0, x1: r.x1, z0: r.z1 - 0.3 - LINE, z1: r.z1 - 0.3 });
  for (let x = r.x0; x < r.x1; x += 9) markings.push({ x0: x, x1: x + 3, z0: middle - LINE / 2, z1: middle + LINE / 2 });
  for (const line of markings) group.add(flat(line, groundY + 0.002, paint));

  for (const k of plan.kerbs) group.add(box(k, groundY, KERB_HEIGHT, kerb));
  return group;
}

/** Frees what `buildSite` created for one batch (the shared textures and grass material stay). */
export function disposeSite(group: Group): void {
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const material = object.material as MeshStandardMaterial;
    if (material.name === SHARED) return;
    material.map?.dispose(); // per-site clones of the asphalt grain
    material.dispose();
  });
}
