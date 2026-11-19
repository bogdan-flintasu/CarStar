'use client';

/**
 * Dimension lines around the bare frame: length, clear width, clear height, ridge (or high eave) height and frame spacing.
 * Every value and position is read from the HallLayout, so the lines always measure what is drawn.
 */
import { Line, Text } from '@react-three/drei';
import { formatMetres, type HallLayout, type Vec3 } from '@/lib/hall';

interface DimensionLinesProps {
  layout: HallLayout;
  visible: boolean;
  /** The theme's accent colour (`useAccentColor()`). */
  color: string;
}
/** Distance of the lines from the building, and their height above the floor. */
const OFFSET = 1.5;
const FLOOR_CLEARANCE = 0.1;
const TICK = 0.5;
const LABEL_LIFT = 0.5;

/** Label lying on the ground, read along the hall. */
const FLAT_ALONG_HALL: Vec3 = [-Math.PI / 2, 0, -Math.PI / 2];
/** Label lying on the ground, read across the hall. */
const FLAT_ACROSS_HALL: Vec3 = [-Math.PI / 2, 0, 0];
/** Upright label facing the left side of the hall. */
const UPRIGHT_FACING_LEFT: Vec3 = [0, -Math.PI / 2, 0];
/** Upright label facing the front of the hall. */
const UPRIGHT_FACING_FRONT: Vec3 = [0, 0, 0];

const metres = formatMetres;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const midpoint = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

interface DimensionProps {
  from: Vec3;
  to: Vec3;
  /** Unit direction of the end ticks. */
  tick: Vec3;
  label: string;
  labelRotation: Vec3;
  color: string;
  /** Offset of the label from the middle of the line. */
  labelOffset?: Vec3;
}

function Dimension({ from, to, tick, label, labelRotation, color, labelOffset = [0, LABEL_LIFT, 0] }: DimensionProps) {
  const half = scale(tick, TICK);
  const lines: [Vec3, Vec3][] = [
    [from, to],
    [add(from, scale(half, -1)), add(from, half)],
    [add(to, scale(half, -1)), add(to, half)],
  ];
  return (
    <>
      {lines.map((points, index) => (
        <Line key={index} points={points} color={color} lineWidth={index === 0 ? 2 : 1} depthTest={false} renderOrder={999} />
      ))}
      <Text
        position={add(midpoint(from, to), labelOffset)}
        rotation={labelRotation}
        fontSize={0.8}
        color={color}
        anchorX="center"
        anchorY="bottom"
        material-depthTest={false}
        renderOrder={1000}
      >
        {label}
      </Text>
    </>
  );
}

export default function DimensionLines({ layout, visible, color }: DimensionLinesProps) {
  if (!visible) return null;

  const { params, halfWidths, ridgeY, bay, frames, walls } = layout;
  const sideX = halfWidths.wallOuter + OFFSET;
  const frontZ = walls.front.origin[2] + OFFSET;
  const backZ = frames[frames.length - 1].z;
  const y = FLOOR_CLEARANCE;
  // The highest point: the ridge of a gable, the high column's inner face of a mono-pitch roof.
  // H is the clear height at the (low) eave: on a mono-pitch roof, draw it on the low side.
  const lowX = layout.highSide === 'left' ? sideX : -sideX;
  const topX = layout.highSide ? (layout.highSide === 'left' ? -1 : 1) * halfWidths.columnInner : 0;

  return (
    <group renderOrder={999}>
      <Dimension color={color} from={[sideX, y, 0]} to={[sideX, y, backZ]} tick={[1, 0, 0]} label={`L = ${metres(params.length)}`} labelRotation={FLAT_ALONG_HALL} />
      <Dimension
        color={color}
        from={[-halfWidths.columnInner, y, frontZ]}
        to={[halfWidths.columnInner, y, frontZ]}
        tick={[0, 0, 1]}
        label={`l = ${metres(params.width)}`}
        labelRotation={FLAT_ACROSS_HALL}
      />
      <Dimension
        color={color}
        from={[lowX, 0, 0]}
        to={[lowX, params.height, 0]}
        tick={[1, 0, 0]}
        label={`H = ${metres(params.height)}`}
        labelRotation={UPRIGHT_FACING_LEFT}
        labelOffset={[0, 0, 0]}
      />
      <Dimension
        color={color}
        from={[topX, 0, frontZ]}
        to={[topX, ridgeY, frontZ]}
        tick={[1, 0, 0]}
        label={`${layout.roofType === 'mono' ? 'H max' : 'Coamă'} = ${metres(ridgeY)}`}
        labelRotation={UPRIGHT_FACING_FRONT}
        labelOffset={[0, ridgeY / 2 + 0.2, 0]}
      />
      <Dimension color={color} from={[-sideX, y, 0]} to={[-sideX, y, frames[1].z]} tick={[1, 0, 0]} label={`Pas = ${metres(bay)}`} labelRotation={FLAT_ALONG_HALL} />
    </group>
  );
}
