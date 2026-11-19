/**
 * Kit geometry that is not in the asset, derived from pieces that are. Pure: three.js geometry only, no React.
 *
 * Local coordinates are the kit's (public/models/ASSET_CONTRACT.md): metres, +Y up, pieces authored for the LEFT side,
 * so +X points into the hall.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { COLUMN_DEPTH } from '@/lib/hall';

/**
 * `EaveHaunch`, measured: the column's top end and the horizontal splice plate on it reach up to this height above the
 * anchor (plate top 0.030). Everything above it is the rafter's end: the column extension that boxes the rafter end,
 * and the tapered haunch under the rafter.
 */
const SPLICE_PLATE_TOP = 0.0305;
/** The parts outside the outer column face (side gussets, the top girt cleat) are centred beyond this x. */
const OUTSIDE_COLUMN_X = -COLUMN_DEPTH / 2 - 0.01;
/**
 * On the column's outer flange line (x = -0.151) the extension's walls and stiffeners meet the gusset plates outside
 * it. The gussets lie in the web plane (|z| <= 0.002); the extension's parts reach out to its flange edges (|z| = 0.075).
 */
const OUTER_FACE_X = -COLUMN_DEPTH / 2 + 0.0005;
const WEB_PLANE_Z = 0.01;
/** The rafter's joint point E (ASSET_CONTRACT.md: haunch anchor + (0.1492, 0.2585)), on the inner column face. */
const E = { x: 0.1492, y: 0.2585 };
/** Past this x, a point is out of the column, towards the hall (the haunch's plumb end face is at x = 0.149). */
const PLUMB_END_X = 0.152;

/**
 * Connected parts of an indexed mesh, by shared vertex indices: for each vertex, the bounds of the part it is in, as
 * its centre x and how far it reaches from the web plane along Z. (After welding, a part can be a single face or several
 * glued ones.)
 */
function partBounds(geometry: BufferGeometry): { centreX: Float32Array; reachZ: Float32Array } {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const parent = Int32Array.from({ length: position.count }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  if (index) {
    for (let t = 0; t < index.count; t += 3) {
      const a = find(index.getX(t));
      parent[find(index.getX(t + 1))] = a;
      parent[find(index.getX(t + 2))] = a;
    }
  } else {
    for (let t = 0; t < position.count; t += 3) {
      parent[t + 1] = t;
      parent[t + 2] = t;
    }
  }
  const bounds = new Map<number, [minX: number, maxX: number, minZ: number, maxZ: number]>();
  for (let i = 0; i < position.count; i++) {
    const root = find(i);
    const b = bounds.get(root) ?? [Infinity, -Infinity, Infinity, -Infinity];
    const x = position.getX(i);
    const z = position.getZ(i);
    bounds.set(root, [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]);
  }
  const centreX = new Float32Array(position.count);
  const reachZ = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const [minX, maxX, minZ, maxZ] = bounds.get(find(i))!;
    centreX[i] = (minX + maxX) / 2;
    reachZ[i] = Math.max(-minZ, maxZ);
  }
  return { centreX, reachZ };
}

/**
 * The eave joint of a mono-pitch roof's HIGH side, where the rafter runs down into the hall instead of up, made from
 * `EaveHaunch` (the low side's joint). The joint point E stays put; the rafter's end is mirrored from +pitch to -pitch:
 *
 * - Fixed: the column stub and the splice plate on it (up to the plate's top), and the gussets and girt cleat outside the
 *   column. They stay level and flush with the column below. So does the haunch's foot, which sits on the plate.
 * - Inside the column (the extension that boxes the rafter end, and the haunch's plumb end face): sheared vertically
 *   about E, y += -2 tan(pitch) (x - E.x). Its walls stay plumb and its top and inner plates, parallel to the rafter,
 *   slope at -pitch.
 * - Towards the hall (the tapered haunch, the plate on the rafter): turned by -2 pitch about E. Parts parallel to the
 *   rafter follow the new rafter, and stiffeners square to the rafter stay square to it (they lean the other way).
 */
export function deriveHighEaveJoint(source: BufferGeometry, pitch: number): BufferGeometry {
  const geometry = source.clone();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const { centreX, reachZ } = partBounds(geometry);
  const drop = -2 * Math.tan(pitch);
  const cos = Math.cos(-2 * pitch);
  const sin = Math.sin(-2 * pitch);
  const n = new Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const outsideColumn = centreX[i] < OUTSIDE_COLUMN_X || (x < OUTER_FACE_X && reachZ[i] < WEB_PLANE_Z);
    if (y <= SPLICE_PLATE_TOP || outsideColumn) continue;
    if (normal) n.fromBufferAttribute(normal, i);
    if (x <= PLUMB_END_X) {
      position.setY(i, y + drop * (x - E.x));
      // Normals of the shear y' = y + drop x go through its inverse transpose: n' = (nx - drop ny, ny, nz).
      n.set(n.x - drop * n.y, n.y, n.z);
    } else {
      const dx = x - E.x;
      const dy = y - E.y;
      position.setXY(i, E.x + dx * cos - dy * sin, E.y + dx * sin + dy * cos);
      n.set(n.x * cos - n.y * sin, n.x * sin + n.y * cos, n.z);
    }
    if (normal) {
      n.normalize();
      normal.setXYZ(i, n.x, n.y, n.z);
    }
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

type Point2 = readonly [number, number];

/** A profile polyline, walked by its normalised arc length u in [0, 1]. */
function arcOf(points: readonly Point2[]) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cumulative[cumulative.length - 1];
  const at = (u: number): Point2 => {
    const d = Math.min(Math.max(u, 0), 1) * total;
    let i = 1;
    while (i < points.length - 1 && cumulative[i] < d) i++;
    const f = (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1] || 1);
    return [points[i - 1][0] + f * (points[i][0] - points[i - 1][0]), points[i - 1][1] + f * (points[i][1] - points[i - 1][1])];
  };
  return { total, at };
}

/** Section points are matched by position (the kit's vertices are split where normals break). */
const sectionKey = (x: number, y: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;

/**
 * The gutter's outlet piece: `length` of the kit's `Gutter` (same section, same anchor, centred on z = 0), with a round
 * hole of `holeRadius` through its floor, under the middle of the gutter, for the downpipe's outlet funnel.
 *
 * The gutter's floor is one shell of the section: an inner and an outer arc joined at both rims. Read from the
 * lengthwise faces of the piece, it is rebuilt here around the hole (rings from the hole's edge out to the piece's
 * ends and rims) with a wall round the hole's edge. The rim beads are the kit's own faces, cut to length.
 */
export function deriveGutterOutlet(gutter: BufferGeometry, length: number, holeRadius: number): BufferGeometry {
  const source = gutter.getIndex() ? gutter.toNonIndexed() : gutter;
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const uv = source.getAttribute('uv');

  // Section edges: each lengthwise face joins two section points (a quad is two faces with the same edge).
  const points = new Map<string, Point2>();
  const links = new Map<string, Set<string>>();
  const faceEdge: (string | null)[] = [];
  for (let t = 0; t < position.count; t += 3) {
    const keys = new Set<string>();
    let ends = 0;
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = [position.getX(t + k), position.getY(t + k), position.getZ(t + k)];
      if (z > 0.5) ends++;
      const key = sectionKey(x, y);
      points.set(key, [x, y]);
      keys.add(key);
    }
    if (ends === 0 || ends === 3 || keys.size !== 2) {
      faceEdge.push(null); // an end cap
      continue;
    }
    const [a, b] = [...keys];
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
    faceEdge.push([a, b].sort().join('|'));
  }

  // The floor shell is the largest loop of section points (the rim beads are small loops).
  const seen = new Set<string>();
  let shell: string[] = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    for (let at = start; ; ) {
      const next = [...links.get(at)!].find((key) => !seen.has(key));
      if (!next) break;
      seen.add(next);
      loop.push(next);
      at = next;
    }
    if (loop.length > shell.length) shell = loop;
  }
  // It is the inner arc, a short edge across the rim, the outer arc and another short edge: cut at the two shortest.
  const loop = shell.map((key) => points.get(key)!);
  const edgeLength = (i: number) => {
    const [a, b] = [loop[i], loop[(i + 1) % loop.length]];
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  };
  const [cutA, cutB] = loop
    .map((_, i) => i)
    .sort((i, j) => edgeLength(i) - edgeLength(j))
    .slice(0, 2)
    .sort((i, j) => i - j);
  const halves = [loop.slice(cutA + 1, cutB + 1), [...loop.slice(cutB + 1), ...loop.slice(0, cutA + 1)]].map((half) =>
    [...half].sort((p, q) => p[0] - q[0]),
  );
  const xs = loop.map(([x]) => x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const top = Math.max(...loop.map(([, y]) => y));
  const meanRadius = (half: readonly Point2[]) => half.reduce((sum, [x, y]) => sum + Math.hypot(x - cx, y - top), 0) / half.length;
  const [innerPoints, outerPoints] = meanRadius(halves[0]) < meanRadius(halves[1]) ? halves : [halves[1], halves[0]];
  const inner = arcOf(innerPoints);
  const outer = arcOf(outerPoints);
  const floorEdges = new Set(
    [innerPoints, outerPoints].flatMap((arc) =>
      arc.slice(1).map((p, i) => [sectionKey(...arc[i]), sectionKey(...p)].sort().join('|')),
    ),
  );

  // The floor is laid out flat as (s, z): s along the inner arc from under the middle of the gutter (x = cx).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (inner.at(mid)[0] < cx) lo = mid;
    else hi = mid;
  }
  const s0 = lo * inner.total;
  const sMin = -s0;
  const sMax = inner.total - s0;
  const half = length / 2;
  const uOf = (s: number) => (s + s0) / inner.total;
  const inHole = (s: number, z: number) => (inner.at(uOf(s))[0] - cx) ** 2 + z * z - holeRadius * holeRadius;

  // Rays from the hole's centre, through the four corners too, each cut into rings from the hole's edge outwards.
  const corners = [
    [sMax, half],
    [sMin, half],
    [sMin, -half],
    [sMax, -half],
  ].map(([s, z]) => Math.atan2(z, s));
  const RAYS = 48;
  const RINGS = 6;
  const angles = [...Array.from({ length: RAYS }, (_, i) => -Math.PI + (2 * Math.PI * i) / RAYS), ...corners]
    .map((a) => (a < -Math.PI ? a + 2 * Math.PI : a))
    .sort((a, b) => a - b)
    .filter((a, i, all) => i === 0 || a - all[i - 1] > 1e-6);
  const grid = angles.map((angle) => {
    const [c, n] = [Math.cos(angle), Math.sin(angle)];
    const exit = Math.min(
      Math.abs(c) > 1e-9 ? (c > 0 ? sMax : sMin) / c : Infinity,
      Math.abs(n) > 1e-9 ? (n > 0 ? half : -half) / n : Infinity,
    );
    let [a, b] = [0, exit];
    for (let i = 0; i < 50; i++) {
      const mid = (a + b) / 2;
      if (inHole(mid * c, mid * n) < 0) a = mid;
      else b = mid;
    }
    return Array.from({ length: RINGS + 1 }, (_, k) => {
      const t = a + (exit - a) * (k / RINGS) ** 1.4;
      return [t * c, t * n] as const;
    });
  });

  const out = { position: [] as number[], normal: [] as number[], uv: [] as number[] };
  /** One smooth surface: an indexed patch, normals from its own faces, facing `towards` at its first face. */
  function addSurface(vertices: readonly (readonly [number, number, number, number, number])[], faces: number[], towards: Vector3) {
    const patch = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(vertices.flatMap(([x, y, z]) => [x, y, z]), 3))
      .setAttribute('uv', new Float32BufferAttribute(vertices.flatMap(([, , , u, v]) => [u, v]), 2))
      .setIndex(faces);
    const p = patch.getAttribute('position');
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(p, faces[k]));
    if (new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).dot(towards) < 0) {
      for (let i = 0; i < faces.length; i += 3) [faces[i + 1], faces[i + 2]] = [faces[i + 2], faces[i + 1]];
      patch.setIndex(faces);
    }
    patch.computeVertexNormals();
    const flat = patch.toNonIndexed();
    out.position.push(...flat.getAttribute('position').array);
    out.normal.push(...flat.getAttribute('normal').array);
    out.uv.push(...flat.getAttribute('uv').array);
  }
  const width = RINGS + 1;
  const quads = (columns: number, rows: number, wrap: boolean) => {
    const faces: number[] = [];
    for (let i = 0; i < (wrap ? columns : columns - 1); i++) {
      const j = (i + 1) % columns;
      for (let k = 0; k < rows - 1; k++) {
        faces.push(i * rows + k, j * rows + k, j * rows + k + 1, i * rows + k, j * rows + k + 1, i * rows + k + 1);
      }
    }
    return faces;
  };
  const surface = (arc: typeof inner) =>
    grid.flatMap((ray) => ray.map(([s, z]) => [...arc.at(uOf(s)), z, s, z] as [number, number, number, number, number]));
  const firstRay = grid[0][0];
  const [ix, iy] = inner.at(uOf(firstRay[0]));
  // The inside of the floor faces the middle of the gutter (up); its underside faces away; the hole's wall faces in.
  addSurface(surface(inner), quads(grid.length, width, true), new Vector3(cx - ix, top - iy, 0));
  addSurface(surface(outer), quads(grid.length, width, true), new Vector3(ix - cx, iy - top, 0));
  const wall = grid.flatMap(([[s, z]]) => [
    [...inner.at(uOf(s)), z, s, 0] as [number, number, number, number, number],
    [...outer.at(uOf(s)), z, s, 0.003] as [number, number, number, number, number],
  ]);
  addSurface(wall, quads(grid.length, 2, true), new Vector3(cx - ix, 0, -firstRay[1]));

  // The rims: the kit's lengthwise faces that are not the floor, cut to the piece's length.
  const n = new Vector3();
  for (let t = 0; t < position.count; t += 3) {
    const edge = faceEdge[t / 3];
    if (!edge || floorEdges.has(edge)) continue;
    for (let k = 0; k < 3; k++) {
      out.position.push(position.getX(t + k), position.getY(t + k), (position.getZ(t + k) - 0.5) * length);
      n.fromBufferAttribute(normal, t + k).normalize();
      out.normal.push(n.x, n.y, n.z);
      out.uv.push(uv ? uv.getX(t + k) : 0, uv ? uv.getY(t + k) : 0);
    }
  }

  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(out.position, 3))
    .setAttribute('normal', new Float32BufferAttribute(out.normal, 3))
    .setAttribute('uv', new Float32BufferAttribute(out.uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
