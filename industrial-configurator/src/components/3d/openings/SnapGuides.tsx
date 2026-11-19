'use client';

/** Thin guide lines on a wall for the snaps that hold (T1c): bay centre, wall middle, shared sill, equal gaps. */
import { faceHeightAt, wallPointToWorld } from '@/lib/hall';
import type { WallDescriptor } from '@/lib/hall';
import type { SnapGuide } from './snapping';

const LINE = 0.025;
/** In front of the wall face, the band and the preview (they sit at 0.012–0.02). */
const OUT = 0.03;
/** Tick height at the ends of an equal-gap segment. */
const TICK = 0.25;

interface Bar {
  key: string;
  h: number;
  v: number;
  w: number;
  ht: number;
}

function bars(guide: SnapGuide, wall: WallDescriptor, i: number): Bar[] {
  switch (guide.kind) {
    case 'bayCentre':
    case 'wallCentre': {
      const top = faceHeightAt(wall, guide.h);
      return [{ key: `${i}`, h: guide.h, v: top / 2, w: LINE, ht: top }];
    }
    case 'sill':
      return [{ key: `${i}`, h: (guide.h0 + guide.h1) / 2, v: guide.v, w: guide.h1 - guide.h0, ht: LINE }];
    case 'equalGap':
      return guide.gaps.flatMap((g, j) => [
        { key: `${i}-${j}`, h: (g.h0 + g.h1) / 2, v: guide.v, w: Math.max(LINE, g.h1 - g.h0), ht: LINE },
        { key: `${i}-${j}a`, h: g.h0, v: guide.v, w: LINE, ht: TICK },
        { key: `${i}-${j}b`, h: g.h1, v: guide.v, w: LINE, ht: TICK },
      ]);
  }
}

export default function SnapGuides({ wall, guides, color }: { wall: WallDescriptor; guides: readonly SnapGuide[]; color: string }) {
  return (
    <group>
      {guides.flatMap((g, i) => bars(g, wall, i)).map((b) => (
        <mesh key={b.key} position={wallPointToWorld(wall, b.h, b.v, OUT)} rotation={[0, wall.yaw, 0]} renderOrder={6}>
          <planeGeometry args={[b.w, b.ht]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
