/**
 * The AR model of the hall (docs/plans/ar.md): a self-contained copy of the live hall, made for phones.
 *
 * - Only visible meshes are taken; editing helpers (`userData.renderHidden`), invisible materials (depth masks, pick
 *   targets) and the small fittings nobody sees at AR distance (bolts, cleats) are dropped.
 * - Instanced pieces are expanded and everything is baked into world space, then merged into one mesh per material, so
 *   a phone draws a handful of meshes whatever the hall's size.
 * - Materials are plain PBR copies (colour, metalness, roughness, opacity, colour and normal maps): no editing glows,
 *   no section-cut clipping planes.
 * - Real scale in metres, +Y up, origin moved to `origin` (the hall's centre on the ground).
 *
 * Pure three.js, no DOM: the browser exporters (arExport.tsx) and unit tests share it; the GPU render server (stage 2)
 * can run it in Node.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Scene,
  type Material,
  type Object3D,
  type Side,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** userData flag of editing helpers (same key as `RENDER_HIDDEN` in hall/renders.tsx, kept here to stay DOM-free). */
const RENDER_HIDDEN = 'renderHidden';

/** Fittings left out of the AR model: invisible at AR distance, and most of the triangles of a long hall. */
export const AR_DROPPED_PIECES: ReadonlySet<string> = new Set(['Bolts', 'Bolt', 'PurlinCleat', 'GirtCleat']);

/** Plan budget, checked on the largest hall. */
export const AR_TRIANGLE_BUDGET = 300_000;

export interface ArSceneStats {
  triangles: number;
  meshes: number;
  /** Source meshes and instances that went in. */
  parts: number;
}

export interface ArSceneResult {
  scene: Scene;
  stats: ArSceneStats;
}

export interface ArSceneOptions {
  /** World point that becomes the model's origin: the hall's centre on the ground. */
  origin: readonly [number, number, number];
  /** Object names left out with everything under them. Default `AR_DROPPED_PIECES`. */
  dropped?: ReadonlySet<string>;
}

interface Bucket {
  material: MeshStandardMaterial;
  geometries: BufferGeometry[];
}

type PbrLike = Material & {
  color?: Color;
  metalness?: number;
  roughness?: number;
  map?: Texture | null;
  normalMap?: Texture | null;
  colorWrite?: boolean;
};

/** A material draws nothing: colour writes off, or fully transparent. */
function isInvisible(material: Material): boolean {
  return !material.visible || material.colorWrite === false || (material.transparent && material.opacity <= 0.001);
}

const textureKey = (t: Texture | null | undefined) =>
  t ? `${t.source.uuid}:${t.repeat.x},${t.repeat.y}:${t.offset.x},${t.offset.y}:${t.rotation}:${t.flipY}` : '-';

/** Materials that look the same share one AR material (every opening has its own copies of the same few). */
function materialKey(material: PbrLike): string {
  return [
    material.color ? material.color.getHexString() : 'ffffff',
    (material.metalness ?? 0).toFixed(3),
    (material.roughness ?? 1).toFixed(3),
    material.transparent ? material.opacity.toFixed(3) : '1',
    material.side,
    textureKey(material.map),
    textureKey(material.normalMap),
  ].join('|');
}

function arMaterial(source: PbrLike, name: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    name,
    color: source.color ? source.color.clone() : new Color(0xffffff),
    metalness: source.metalness ?? 0,
    roughness: source.roughness ?? 1,
    map: source.map ?? null,
    normalMap: source.normalMap ?? null,
    transparent: source.transparent && source.opacity < 1,
    opacity: source.transparent ? source.opacity : 1,
    side: (source.side === DoubleSide ? DoubleSide : FrontSide) as Side,
  });
  if (material.transparent) material.depthWrite = false;
  return material;
}

/**
 * One draw range of a geometry (a material group, or the whole) as a stand-alone indexed geometry with exactly
 * position, normal and uv, so every part merges with every other.
 */
function normalisedPart(source: BufferGeometry, start: number, count: number): BufferGeometry | null {
  const position = source.getAttribute('position');
  if (!position || count <= 0) return null;
  const sourceIndex = source.getIndex();
  const end = Math.min(start + count, sourceIndex ? sourceIndex.count : position.count);
  if (end - start < 3) return null;

  // Collect the vertices this range uses, renumbered from 0.
  const remap = new Map<number, number>();
  const used: number[] = [];
  const index = new Uint32Array(end - start);
  for (let i = start; i < end; i++) {
    const v = sourceIndex ? sourceIndex.getX(i) : i;
    let to = remap.get(v);
    if (to === undefined) {
      to = used.length;
      remap.set(v, to);
      used.push(v);
    }
    index[i - start] = to;
  }

  const normal = source.getAttribute('normal');
  const uv = source.getAttribute('uv');
  const positions = new Float32Array(used.length * 3);
  const normals = new Float32Array(used.length * 3);
  const uvs = new Float32Array(used.length * 2);
  used.forEach((v, i) => {
    positions.set([position.getX(v), position.getY(v), position.getZ(v)], i * 3);
    if (normal) normals.set([normal.getX(v), normal.getY(v), normal.getZ(v)], i * 3);
    if (uv) uvs.set([uv.getX(v), uv.getY(v)], i * 2);
  });

  const part = new BufferGeometry();
  part.setAttribute('position', new BufferAttribute(positions, 3));
  part.setAttribute('normal', new BufferAttribute(normals, 3));
  part.setAttribute('uv', new BufferAttribute(uvs, 2));
  part.setIndex(new BufferAttribute(index, 1));
  if (!normal) part.computeVertexNormals();
  return part;
}

/** Moves a part into the model's space; a mirroring transform also flips the winding, so faces stay outward. */
function bake(part: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const baked = part.clone();
  baked.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    const index = baked.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
  }
  return baked;
}

/** Visible all the way up (the caller has already put the scene in its quote state: cladding and layers shown). */
function shown(object: Object3D, dropped: ReadonlySet<string>): boolean {
  return object.visible && !object.userData[RENDER_HIDDEN] && !dropped.has(object.name);
}

/**
 * Builds the AR model from `roots` (the hall group and the openings group of the live scene). The source scene is not
 * changed; the result shares only textures with it (the exporter replaces them with resized copies).
 */
export function buildArScene(roots: readonly Object3D[], options: ArSceneOptions): ArSceneResult {
  const dropped = options.dropped ?? AR_DROPPED_PIECES;
  const toOrigin = new Matrix4().makeTranslation(-options.origin[0], -options.origin[1], -options.origin[2]);
  const buckets = new Map<string, Bucket>();
  let parts = 0;

  const add = (material: PbrLike, part: BufferGeometry, matrix: Matrix4) => {
    const key = materialKey(material);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: arMaterial(material, `Hall_${buckets.size}`), geometries: [] };
      buckets.set(key, bucket);
    }
    bucket.geometries.push(bake(part, matrix));
    parts++;
  };

  const visit = (object: Object3D) => {
    if (!shown(object, dropped)) return;
    if (object instanceof Mesh && object.geometry) {
      const materials = [object.material].flat() as PbrLike[];
      const geometry = object.geometry as BufferGeometry;
      const total = geometry.getIndex()?.count ?? geometry.getAttribute('position')?.count ?? 0;
      const ranges =
        geometry.groups.length > 0 && Array.isArray(object.material)
          ? geometry.groups.map((g) => ({ start: g.start, count: g.count, material: materials[g.materialIndex ?? 0] }))
          : [{ start: 0, count: total, material: materials[0] }];

      const world = new Matrix4().multiplyMatrices(toOrigin, object.matrixWorld);
      const instances =
        object instanceof InstancedMesh
          ? Array.from({ length: object.count }, (_, i) => {
              const m = new Matrix4();
              object.getMatrixAt(i, m);
              return new Matrix4().multiplyMatrices(world, m);
            })
          : [world];

      for (const range of ranges) {
        if (!range.material || isInvisible(range.material)) continue;
        const part = normalisedPart(geometry, range.start, range.count);
        if (!part) continue;
        for (const matrix of instances) add(range.material, part, matrix);
        part.dispose();
      }
    }
    for (const child of object.children) visit(child);
  };

  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    visit(root);
  }

  const scene = new Scene();
  scene.name = 'Hall';
  let triangles = 0;
  for (const { material, geometries } of buckets.values()) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    triangles += merged.getIndex()!.count / 3;
    const mesh = new Mesh(merged, material);
    mesh.name = material.name;
    scene.add(mesh);
  }
  return { scene, stats: { triangles, meshes: scene.children.length, parts } };
}

/**
 * USD has no double-sided materials (AR Quick Look draws front faces only): gives every double-sided mesh an explicit
 * back face (reversed winding, flipped normals) and makes it single-sided. For the USDZ only; the GLB keeps
 * `doubleSided`. Changes `scene` in place.
 */
export function addBackFaces(scene: Scene): void {
  for (const object of [...scene.children]) {
    if (!(object instanceof Mesh)) continue;
    const material = object.material as Material;
    if (material.side !== DoubleSide) continue;
    const front = object.geometry as BufferGeometry;
    const back = front.clone();
    const index = back.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    const normal = back.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
    const both = mergeGeometries([front, back], false);
    back.dispose();
    if (!both) continue;
    front.dispose();
    object.geometry = both;
    material.side = FrontSide;
  }
}

/** The model's origin for a hall: the centre of its footprint, on the ground. */
export function arOrigin(bounds: { min: readonly number[]; max: readonly number[] }, groundY: number): [number, number, number] {
  return [(bounds.min[0] + bounds.max[0]) / 2, groundY, (bounds.min[2] + bounds.max[2]) / 2];
}

/** Disposes the model's own geometries and materials (textures belong to the exporter or the live scene). */
export function disposeArScene(scene: Scene): void {
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      (object.material as Material).dispose();
    }
  });
}
