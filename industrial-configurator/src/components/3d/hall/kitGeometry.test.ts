import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeHallLayout } from '@/lib/hall';
import { deriveGutterOutlet, deriveHighEaveJoint } from './kitGeometry';
import { RAFTER_CUT_SLOPE, RAFTER_END } from './kit';
import { placeKit } from './placements';

const PITCH = (10 * Math.PI) / 180;

/** A box between two corners, as one welded part of a joint (the kit's local coordinates). */
function box([x0, y0]: [number, number], [x1, y1]: [number, number], depth = 0.15): BufferGeometry {
  const geometry = new BoxGeometry(x1 - x0, y1 - y0, depth).translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  return mergeVertices(geometry);
}

/** One face of a thin plate on its own (welding can leave a face as a part of its own). */
function face(x: number, [y0, y1]: [number, number], [z0, z1]: [number, number]): BufferGeometry {
  return new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0], 3))
    .setIndex([0, 1, 2, 0, 2, 3]);
}

/** Several parts in one indexed geometry, like the kit's EaveHaunch. */
function joint(...parts: BufferGeometry[]): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const base = positions.length / 3;
    positions.push(...part.getAttribute('position').array);
    indices.push(...part.getIndex()!.array.map((i) => i + base));
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)).setIndex(indices);
}

const ys = (geometry: BufferGeometry, from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => geometry.getAttribute('position').getY(from + i));

describe('deriveHighEaveJoint', () => {
  const E = { x: 0.1492, y: 0.2585 };
  const plate = box([-0.251, 0.015], [0.34, 0.03]); // splice plate on the column top: stays level
  const extension = box([-0.151, 0.03], [0.149, 0.563]); // boxes the rafter end: its top takes the new slope
  const haunch = box([0.149, 0.03], [1.96, 0.5]); // under the rafter
  const cleat = box([-0.271, 0.433], [-0.151, 0.493]); // girt cleat outside the column: stays level
  const gusset = face(-0.151, [0.056, 0.21], [-0.002, 0.002]); // edge of a gusset plate on the outer flange: stays
  // A side face of the extension on its own, flat in the frame plane at the flange edge (z = 0.075): it moves.
  const sideFace = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute([-0.151, 0.03, 0.075, 0.149, 0.03, 0.075, 0.149, 0.51, 0.075, -0.151, 0.51, 0.075], 3))
    .setIndex([0, 1, 2, 0, 2, 3]);
  const moving = [extension, sideFace, haunch];
  const source = joint(plate, ...moving, cleat, gusset);
  const count = (g: BufferGeometry) => g.getAttribute('position').count;
  const fixedHead = count(plate);
  const movingEnd = fixedHead + moving.map(count).reduce((a, b) => a + b, 0);
  const derived = deriveHighEaveJoint(source, PITCH);

  it('leaves the column side of the joint where it is', () => {
    expect(ys(derived, 0, fixedHead)).toEqual(ys(source, 0, fixedHead));
    expect(ys(derived, movingEnd, count(source))).toEqual(ys(source, movingEnd, count(source)));
  });

  it('shears the parts inside the column to -pitch and turns the rest of the rafter end by -2 pitch about E', () => {
    const before = source.getAttribute('position');
    const after = derived.getAttribute('position');
    const [cos, sin] = [Math.cos(-2 * PITCH), Math.sin(-2 * PITCH)];
    for (let i = fixedHead; i < movingEnd; i++) {
      const [x, y] = [before.getX(i), before.getY(i)];
      let expected: [number, number] = [x, y];
      if (y > 0.0305 && x <= 0.152) expected = [x, y - 2 * Math.tan(PITCH) * (x - E.x)];
      else if (y > 0.0305) expected = [E.x + (x - E.x) * cos - (y - E.y) * sin, E.y + (x - E.x) * sin + (y - E.y) * cos];
      expect(after.getX(i)).toBeCloseTo(expected[0], 6);
      expect(after.getY(i)).toBeCloseTo(expected[1], 6);
    }
  });

  it('turns a stiffener square to the rafter from leaning back by the pitch to leaning forward by it', () => {
    // From the rafter's underside at 1.8 m in, 0.3 m up square to the low-side rafter.
    const base = [E.x + 1.8, E.y + 1.8 * Math.tan(PITCH)];
    const tip = [base[0] - 0.3 * Math.sin(PITCH), base[1] + 0.3 * Math.cos(PITCH)];
    const stiffener = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute([...base, 0.004, ...tip, 0.004, ...tip, -0.004], 3))
      .setIndex([0, 1, 2]);
    const turned = deriveHighEaveJoint(stiffener, PITCH).getAttribute('position');
    expect(turned.getX(1) - turned.getX(0)).toBeCloseTo(0.3 * Math.sin(PITCH), 6);
  });
});

describe('rafter placement', () => {
  /** World x of the bottom and top of a rafter's end cut at `end` (0 or RAFTER_END), in its own geometry. */
  function cut(matrix: Matrix4, end: number) {
    const bottom = new Vector3(end, 0, 0).applyMatrix4(matrix);
    const top = new Vector3(end + RAFTER_CUT_SLOPE * 0.3, 0.3, 0).applyMatrix4(matrix);
    return { bottom, top };
  }

  it.each([
    ['gable', 20],
    ['mono', 12],
    ['mono', 25],
  ] as const)('keeps both end cuts plumb on a %s roof %d m wide', (roofType, width) => {
    const layout = computeHallLayout({ width, height: 6, length: 12, foundation: true, panels: false, insulationMm: 0, roofType });
    const [rafter] = layout.rafters;
    const { matrix } = placeKit(layout).Rafter[0];
    for (const end of [0, RAFTER_END]) {
      const { bottom, top } = cut(matrix, end);
      expect(top.x).toBeCloseTo(bottom.x, 4);
    }
    // A mono rafter runs from one inner column face to the other.
    if (roofType === 'mono') expect(cut(matrix, RAFTER_END).bottom.x).toBeCloseTo(rafter.to[0], 4);
  });
});

describe('deriveGutterOutlet', () => {
  /** The kit's gutter: a half-round floor shell (inner and outer arc) with a bead on each rim, 1 m long along +Z. */
  async function kitGutter(name: string) {
    const { readFile } = await import('node:fs/promises');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
    const file = await readFile('public/models/hall-kit.glb');
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, '');
    return (gltf.scene.getObjectByName(name) as import('three').Mesh).geometry as BufferGeometry;
  }

  it.each(['Gutter', 'Gutter_LOD1'])('cuts a round hole through the floor of %s and keeps its section', async (name) => {
    const gutter = await kitGutter(name);
    const outlet = deriveGutterOutlet(gutter, 0.16, 0.032);
    gutter.computeBoundingBox();
    outlet.computeBoundingBox();
    const [g, o] = [gutter.boundingBox!, outlet.boundingBox!];
    expect(o.min.x).toBeCloseTo(g.min.x, 4);
    expect(o.max.x).toBeCloseTo(g.max.x, 3);
    expect(o.min.y).toBeCloseTo(g.min.y, 4);
    expect([o.min.z, o.max.z]).toEqual([expect.closeTo(-0.08, 6), expect.closeTo(0.08, 6)]);
    // No floor point within the hole (in plan, about the gutter's middle line), and the hole's edge is on its circle.
    const middle = (g.min.x + g.max.x) / 2;
    const position = outlet.getAttribute('position');
    let closest = Infinity;
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) < -0.02) closest = Math.min(closest, Math.hypot(position.getX(i) - middle, position.getZ(i)));
    }
    expect(closest).toBeCloseTo(0.032, 3);
    // Every face has a normal.
    const normal = outlet.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 3);
  });
});
