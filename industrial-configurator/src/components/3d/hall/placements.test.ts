/**
 * placeKit against the ground truth: assets/blender/kit_reference.json holds the transform of every kit piece
 * re-fitted on the original 12 m frame (da.glb). A layout of the same size must put the pieces in the same places.
 */
import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import reference from '../../../../assets/blender/kit_reference.json';
import { computeHallLayout } from '@/lib/hall';
import type { KitPieceName } from './kit';
import { placeBolts, placeKit, type Placement } from './placements';

interface ReferenceInstance {
  piece: string;
  src: string[];
  t: number[];
  q_xyzw: number[];
  s: number[];
}

// The source frame: 12 m between the inner column faces, rafter underside 6.0735 m up, one 6 m bay, thin sheeting.
const layout = computeHallLayout({ width: 12, height: 6.0735, length: 6, foundation: true, panels: false, insulationMm: 0 });
const placements = placeKit(layout);
const SOURCE_CENTRE_X = reference.constants.hall_centre_x_from_columns;

function decompose({ matrix }: Placement) {
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  return { position, rotation, scale };
}

/** Distance from a reference instance to the closest placement with the same orientation and stretch. */
function closestMatch(instance: ReferenceInstance, ignoreZ: boolean): number {
  const target = new Vector3(instance.t[0] - SOURCE_CENTRE_X, instance.t[1], ignoreZ ? 0 : instance.t[2]);
  const targetRotation = new Quaternion(...(instance.q_xyzw as [number, number, number, number]));
  const distances = placements[instance.piece as KitPieceName].map((placement) => {
    const { position, rotation, scale } = decompose(placement);
    if (ignoreZ) position.z = 0;
    const sameRotation = Math.abs(rotation.dot(targetRotation)) > 0.9999;
    const sameStretch = ignoreZ || instance.s.every((value, axis) => Math.abs(scale.getComponent(axis) / value - 1) < 0.03);
    return sameRotation && sameStretch ? position.distanceTo(target) : Infinity;
  });
  return Math.min(...distances);
}

const instances = reference.instances as ReferenceInstance[];
const of = (...pieces: string[]) => instances.filter((instance) => pieces.includes(instance.piece));
const labelled = (list: ReferenceInstance[]) => list.map((i) => [i.piece, i.src[0], i] as const);

describe('placeKit on the source frame', () => {
  it.each(labelled(of('Column', 'BasePlate', 'EaveHaunch', 'Rafter', 'RidgeJoint')))(
    'puts %s (%s) where the source frame has it',
    (_piece, _src, instance) => {
      expect(closestMatch(instance, false)).toBeLessThan(0.02);
    },
  );

  // Seats are spread evenly (the source's vary by a few cm), and purlins run 75 mm past the end frames, flush with
  // the flanges, so their start and stretch differ slightly.
  it.each(labelled(of('Purlin', 'PurlinCleat')))('runs %s (%s) on the source seat', (_piece, _src, instance) => {
    expect(closestMatch(instance, false)).toBeLessThan(0.08);
  });

  // Rainwater follows the cladding: same section position and orientation, its own extent along the hall.
  it.each(labelled(of('Gutter', 'GutterEndCap', 'Downpipe', 'DownpipeShoe', 'DownpipeOutlet')))(
    'hangs %s (%s) on the source eave line',
    (_piece, _src, instance) => {
      expect(closestMatch(instance, true)).toBeLessThan(0.02);
    },
  );

  it('alternates the girt cleats and keeps them on the outer column faces', () => {
    const cleats = placements.GirtCleat.map(decompose);
    expect(cleats).toHaveLength(layout.columns.length * layout.girtLevels.length);
    for (const { position } of cleats) expect(Math.abs(position.x)).toBeCloseTo(layout.halfWidths.columnOuter, 9);
    const upsideDown = cleats.filter(({ rotation }) => Math.abs(rotation.x) > 0.99 || Math.abs(rotation.z) > 0.99);
    expect(upsideDown).toHaveLength(layout.columns.length * Math.floor(layout.girtLevels.length / 2));
  });
});

describe('placeKit in general', () => {
  it.each([
    [8, 3, 12],
    [13.5, 4.5, 17],
    [20, 6, 102],
  ])('never mirrors or skews a piece (%s x %s x %s)', (width, height, length) => {
    const all = placeKit(computeHallLayout({ width, height, length, foundation: true, panels: true, insulationMm: 100 }));
    for (const placement of Object.values(all).flat()) {
      expect(placement.matrix.determinant()).toBeGreaterThan(0);
      expect(placement.matrix.elements.every(Number.isFinite)).toBe(true);
    }
  });

  it('makes one purlin per line and bay, and one cleat per line and frame', () => {
    const long = computeHallLayout({ width: 15, height: 4, length: 30, foundation: true, panels: true, insulationMm: 100 });
    const all = placeKit(long);
    expect(all.Purlin).toHaveLength(long.purlins.length * long.bayCount);
    expect(all.PurlinCleat).toHaveLength(long.purlins.length * long.frames.length);
    const stretched = all.Purlin.map((p) => decompose(p).scale.z).reduce((sum, z) => sum + z, 0);
    expect(stretched).toBeCloseTo(long.purlins.length * (long.purlins[0].zFrom - long.purlins[0].zTo), 6);
  });

  it('leaves the outward cleat sockets of the end frames empty', () => {
    const socket = (side?: '+Z' | '-Z') => ({ matrix: new Matrix4(), side });
    const pieces = Object.fromEntries(Object.keys(placements).map((name) => [name, { sockets: [] as ReturnType<typeof socket>[] }]));
    pieces.PurlinCleat.sockets = [socket('+Z'), socket('+Z'), socket('-Z'), socket('-Z')];
    pieces.BasePlate.sockets = [socket(), socket()];
    const bolts = placeBolts(placements, { pieces } as never);
    // One bay: both frames are end frames, so every cleat keeps one pair; every base plate keeps both bolts.
    expect(bolts).toHaveLength(placements.PurlinCleat.length * 2 + placements.BasePlate.length * 2);
    const front = placements.PurlinCleat.filter((cleat) => decompose(cleat).position.z === 0);
    expect(front.length).toBeGreaterThan(0);
    for (const cleat of front) {
      const openDirection = new Vector3(0, 0, cleat.openSide === '+Z' ? 1 : -1).transformDirection(cleat.matrix);
      expect(openDirection.z).toBeCloseTo(1, 9); // the open side faces out of the front of the hall
    }
  });
});
