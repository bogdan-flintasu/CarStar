import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  DoubleSide,
  FrontSide,
  PlaneGeometry,
} from 'three';
import { computeHallLayout } from '@/lib/hall';
import { placeKit } from '@/components/3d/hall/placements';
import { KIT_PIECES } from '@/components/3d/hall/kit';
import { wallGeometryWithHoles } from '@/components/3d/openings/wallShapeWithHoles';
import { AR_DROPPED_PIECES, AR_TRIANGLE_BUDGET, addBackFaces, arOrigin, buildArScene } from './arScene';

const BOX_TRIANGLES = 12;
const paint = (hex: string) => new MeshStandardMaterial({ color: hex, metalness: 0.25, roughness: 0.5 });

function instanced(name: string, positions: [number, number, number][], material = paint('#333333')) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, positions.length);
  mesh.name = name;
  positions.forEach((p, i) => mesh.setMatrixAt(i, new Matrix4().makeTranslation(...p)));
  return mesh;
}

describe('buildArScene', () => {
  const hall = new Group();
  hall.name = 'Hall';
  hall.add(instanced('Column', [[-5, 2, 0], [5, 2, 0], [-5, 2, 10]]));
  hall.add(instanced('Bolt', [[0, 0, 0], [1, 0, 0]]));
  const helper = new Mesh(new BoxGeometry(), paint('#ff0000'));
  helper.userData.renderHidden = true;
  hall.add(helper);
  const mask = new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ colorWrite: false }));
  hall.add(mask);
  const hidden = new Mesh(new BoxGeometry(), paint('#00ff00'));
  hidden.visible = false;
  hall.add(hidden);
  // A two-material mesh (like a wall: faces + cut edges): BoxGeometry has 6 groups of 2 triangles.
  const wall = new Mesh(new BoxGeometry(2, 2, 2), [paint('#ffffff'), paint('#eeeeee')]);
  wall.geometry.groups.forEach((g, i) => (g.materialIndex = i % 2));
  wall.position.set(0, 1, 5);
  hall.add(wall);
  // Two openings with their own, identical materials: they share one AR material.
  const openings = new Group();
  openings.add(new Mesh(new BoxGeometry(), paint('#123456')), new Mesh(new BoxGeometry(), paint('#123456')));
  openings.children.forEach((o, i) => o.position.set(i, 0.5, 5));

  const { scene, stats } = buildArScene([hall, openings], { origin: [0, 0, 5] });

  it('keeps visible geometry, drops helpers, masks, hidden objects and bolts', () => {
    // 3 columns + the wall + 2 openings.
    expect(stats.triangles).toBe(3 * BOX_TRIANGLES + BOX_TRIANGLES + 2 * BOX_TRIANGLES);
  });

  it('merges into one mesh per distinct material', () => {
    // column steel, the wall's two materials, the openings' shared one.
    expect(stats.meshes).toBe(4);
    expect(scene.children.every((c) => c instanceof Mesh && !(c instanceof InstancedMesh))).toBe(true);
  });

  it('bakes instances into world space, moved to the origin', () => {
    const box = new Box3().setFromObject(scene);
    expect(box.min.x).toBeCloseTo(-5.5);
    expect(box.max.x).toBeCloseTo(5.5);
    expect(box.min.z).toBeCloseTo(-5.5);
    expect(box.max.z).toBeCloseTo(5.5);
    expect(box.min.y).toBeCloseTo(0);
  });

  it('leaves the source scene untouched', () => {
    expect(hall.children).toHaveLength(6);
    expect((hall.children[0] as InstancedMesh).count).toBe(3);
  });
});

/** Triangles per kit mesh, read from the GLB's JSON chunk (no loader needed). */
function kitTriangles(): Record<string, number> {
  const file = readFileSync(path.join(process.cwd(), 'public/models/hall-kit.glb'));
  const json = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString());
  const out: Record<string, number> = {};
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    out[node.name] = json.meshes[node.mesh].primitives.reduce(
      (sum: number, p: { indices?: number; attributes: { POSITION: number } }) =>
        sum + json.accessors[p.indices ?? p.attributes.POSITION].count / 3,
      0,
    );
  }
  return out;
}

describe('AR budget on the largest hall (L = 102 m)', () => {
  it('stays under the triangle budget with every kit piece but the dropped fittings', () => {
    const layout = computeHallLayout({ width: 20, length: 102, height: 6, foundation: true, panels: true, insulationMm: 100 });
    const placements = placeKit(layout);
    const kit = kitTriangles();
    // Derived in code from a kit mesh (kitGeometry.ts): same triangles as their source.
    const perPiece: Record<string, number> = { ...kit, EaveHaunchHigh: kit.EaveHaunch, GutterOutlet: kit.Gutter };
    const steel = KIT_PIECES.filter((name) => !AR_DROPPED_PIECES.has(name)).reduce(
      (sum, name) => sum + placements[name].length * perPiece[name],
      0,
    );
    const walls = Object.values(layout.walls).reduce((sum, wall) => {
      const g = wallGeometryWithHoles(wall, []);
      return sum + (g.index?.count ?? g.getAttribute('position').count) / 3;
    }, 0);
    // Roof, trims, slab and 200 openings of ~12 boxes each stay well below this allowance.
    const allowance = 200 * 12 * BOX_TRIANGLES + 10_000;
    expect(Number.isFinite(steel)).toBe(true);
    expect(steel + walls + allowance).toBeLessThan(AR_TRIANGLE_BUDGET);
  });

  it('puts the origin at the centre of the footprint, on the ground', () => {
    const layout = computeHallLayout({ width: 12, length: 30, height: 5, foundation: true, panels: false, insulationMm: 0 });
    const [x, y, z] = arOrigin(layout.bounds, layout.groundY);
    expect(x).toBeCloseTo((layout.bounds.min[0] + layout.bounds.max[0]) / 2);
    expect(y).toBe(layout.groundY);
    expect(z).toBeCloseTo((layout.bounds.min[2] + layout.bounds.max[2]) / 2);
  });
});

describe('addBackFaces (USDZ)', () => {
  it('doubles the triangles of double-sided meshes and makes them single-sided', () => {
    const gutter = new Mesh(new BoxGeometry(), Object.assign(paint('#000000'), { side: DoubleSide }));
    const { scene } = buildArScene([gutter, new Mesh(new BoxGeometry(), paint('#ffffff'))], { origin: [0, 0, 0] });
    addBackFaces(scene);
    const meshes = scene.children as Mesh[];
    const triangles = (m: Mesh) => m.geometry.getIndex()!.count / 3;
    const doubled = meshes.find((m) => triangles(m) === 2 * BOX_TRIANGLES)!;
    expect(doubled).toBeDefined();
    expect((doubled.material as MeshStandardMaterial).side).toBe(FrontSide);
    expect(meshes.some((m) => triangles(m) === BOX_TRIANGLES)).toBe(true);
  });
});
