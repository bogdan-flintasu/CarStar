/**
 * Where every kit piece goes: HallLayout -> one transform per instance. Pure (no React, no scene access).
 *
 * Kit pieces are authored for the left (-X) side. The right-hand copy is the same piece turned 180 degrees about Y,
 * never mirrored: a negative scale would flip the triangle winding of an InstancedMesh.
 * Rotations per piece follow the placement table of public/models/ASSET_CONTRACT.md (section 3).
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { COLUMN_DEPTH, GUTTER_WIDTH, type HallLayout, type HallPurlin, type Side } from '@/lib/hall';
import { KIT_PIECES, type HallKit, type KitPieceName, type SocketSide } from './kit';

export interface Placement {
  matrix: Matrix4;
  /** Local side of the piece with no bay to fasten (cleats on the end frames): its sockets stay empty. */
  openSide?: SocketSide;
}

export type KitPlacements = Readonly<Record<KitPieceName, readonly Placement[]>>;

interface Pose {
  /** Half turn about the vertical: the right-hand copy of a piece, or one facing the back of the hall. */
  turned?: boolean;
  /** Tilt about the hall's length axis: the roof pitch (radians). */
  pitch?: number;
  /** Upside down (half turn about the piece's own X). */
  flipped?: boolean;
  /** Stretch of a 1 m piece along its stretch axis. */
  scale?: readonly [number, number, number];
}

const HALF_TURN = Math.PI;
const isRight = (side: Side) => side === 'right';
const outwards = (side: Side) => (isRight(side) ? 1 : -1);

function place(x: number, y: number, z: number, pose: Pose = {}): Placement {
  const { turned = false, pitch = 0, flipped = false, scale = [1, 1, 1] } = pose;
  const euler = new Euler(flipped ? HALF_TURN : 0, turned ? HALF_TURN : 0, pitch, 'YZX');
  const matrix = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(euler), new Vector3(...scale));
  return { matrix };
}

/** A 1 m piece that runs along the hall, stretched from zFront to zBack. Pieces point along their own +Z. */
function placeAlong(side: Side, x: number, y: number, zFront: number, zBack: number): Placement {
  const turned = isRight(side);
  return place(x, y, turned ? zFront : zBack, { turned, scale: [1, 1, zFront - zBack] });
}

/** A purlin line is one member per bay, joined on the frames. */
function purlinSpans(purlin: HallPurlin, layout: HallLayout): Placement[] {
  const joints = [purlin.zFrom, ...layout.frames.filter((frame) => !frame.isEnd).map((frame) => frame.z), purlin.zTo];
  return joints.slice(1).map((zBack, bay) => placeAlong(purlin.side, purlin.x, purlin.y, joints[bay], zBack));
}

/** One cleat under each purlin on each frame. On an end frame the side facing out of the hall has no purlin bolts. */
function purlinCleats(purlin: HallPurlin, layout: HallLayout): Placement[] {
  const turned = isRight(purlin.side);
  const lastFrame = layout.frames.length - 1;
  return layout.frames.map((frame) => {
    const worldOpenSide = frame.index === 0 ? '+Z' : frame.index === lastFrame ? '-Z' : undefined;
    const openSide = worldOpenSide && turned ? (worldOpenSide === '+Z' ? '-Z' : '+Z') : worldOpenSide;
    return { ...place(purlin.x, purlin.y, frame.z, { turned }), openSide };
  });
}

/** Transforms of every steel piece except the bolts. */
export function placeKit(layout: HallLayout): KitPlacements {
  const { columns, rafters, purlins, gutters, downpipes, halfWidths, roof, pitch } = layout;
  const gutterCentre = (side: Side, innerEdgeX: number) => innerEdgeX + (outwards(side) * GUTTER_WIDTH) / 2;
  const mono = layout.roofType === 'mono';
  const ridge = roof[0];
  const ridgeTopY = ridge.ridge[1] + ridge.plumbThickness;
  const haunch = (c: (typeof columns)[number]) => place(c.x, c.topY, c.z, { turned: isRight(c.side) });

  return {
    // The high-side joint (EaveHaunchHigh) is sheared, so its base plate rises towards the outer column face by
    // up to 2 tan(pitch) x column depth: that column's steel goes up as far, the rest hides inside the joint.
    Column: columns.map((c) => {
      const reach = c.isHigh ? 2 * Math.tan(pitch) * COLUMN_DEPTH : 0;
      return place(c.x, c.baseY, c.z, { turned: isRight(c.side), scale: [1, c.height + reach, 1] });
    }),
    BasePlate: columns.map((c) => place(c.x, 0, c.z, { turned: isRight(c.side) })),
    EaveHaunch: columns.filter((c) => !c.isHigh).map(haunch),
    EaveHaunchHigh: columns.filter((c) => c.isHigh).map(haunch),
    // The cleats' ears alternate below and above the bracket, as on the source frame.
    GirtCleat: columns.flatMap((c) =>
      c.girtLevels.map((y, row) =>
        place(outwards(c.side) * halfWidths.columnOuter, y, c.z, { turned: isRight(c.side), flipped: row % 2 === 1 }),
      ),
    ),
    Rafter: rafters.map((r) => place(r.from[0], r.from[1], r.z, { turned: isRight(r.side), pitch, scale: [r.length, 1, 1] })),
    RidgeJoint: mono ? [] : rafters.filter((r) => !isRight(r.side)).map((r) => place(r.to[0], r.to[1], r.z)),
    Purlin: purlins.flatMap((p) => purlinSpans(p, layout)),
    PurlinCleat: purlins.flatMap((p) => purlinCleats(p, layout)),
    Gutter: gutters.map((g) => placeAlong(g.side, g.x, g.y, g.zFrom, g.zTo)),
    GutterEndCap: gutters.flatMap((g) => [
      place(gutterCentre(g.side, g.x), g.y, g.zFrom),
      place(gutterCentre(g.side, g.x), g.y, g.zTo, { turned: true }),
    ]),
    Downpipe: downpipes.map((d) => place(d.x, d.bottomY, d.z, { turned: d.end === 'back', scale: [1, d.topY - d.bottomY, 1] })),
    DownpipeShoe: downpipes.map((d) => place(d.x, d.bottomY, d.z, { turned: d.end === 'back' })),
    DownpipeOutlet: downpipes.map((d) => place(d.x, d.topY, d.z, { turned: d.end === 'back' })),
    // A mono roof has no ridge: its high edge gets a flashing instead (Trims.tsx).
    RidgeCap: mono ? [] : [placeAlong('left', 0, ridgeTopY, ridge.zFront, ridge.zBack)],
    Bolt: [],
  };
}

/** One bolt in every socket of every placed joint piece: piece transform x socket transform. */
export function placeBolts(placements: KitPlacements, kit: HallKit): Matrix4[] {
  return KIT_PIECES.flatMap((name) =>
    placements[name].flatMap(({ matrix, openSide }) =>
      kit.pieces[name].sockets
        .filter((socket) => socket.side === undefined || socket.side !== openSide)
        .map((socket) => matrix.clone().multiply(socket.matrix)),
    ),
  );
}
