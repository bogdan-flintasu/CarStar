'use client';

/**
 * The highlight of the clicked hall component (T5b): see-through accent copies of the kit piece (instances) or a flat
 * translucent polygon a few mm off the face, both with an accent outline. Mounted inside `renderHiddenProps`, so quote
 * renders never show it.
 */
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Edges, Line } from '@react-three/drei';
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import type { HallLayout } from '@/lib/hall';
import { useComponentSelection } from '@/stores/useComponentSelection';
import { highlightTarget, type HighlightTarget } from './ComponentPicker.map';
import { useHallKit } from './kit';
import { useAccentColor } from '@/components/configurator/UiThemeScope';

/** How far a face overlay floats off the surface (m). */
const FACE_OFFSET = 0.008;

const noRaycast = () => null;

function Instances({ target, color }: { target: Extract<HighlightTarget, { type: 'instances' }>; color: string }) {
  const kit = useHallKit('light');
  const geometry = kit.pieces[target.objectName].geometry;
  return (
    <group>
      {target.instances.map(({ instanceId, matrix }) => (
        <mesh key={instanceId} geometry={geometry} matrix={matrix} matrixAutoUpdate={false} renderOrder={999} raycast={noRaycast}>
          <meshBasicMaterial color={color} transparent opacity={0.35} depthTest={false} depthWrite={false} />
          <Edges color={color} threshold={20} renderOrder={1000} />
        </mesh>
      ))}
    </group>
  );
}

function Face({ target, color }: { target: Extract<HighlightTarget, { type: 'face' }>; color: string }) {
  const points = useMemo(
    () =>
      target.polygon.map(
        ([x, y, z]) =>
          [
            x + target.normal[0] * FACE_OFFSET,
            y + target.normal[1] * FACE_OFFSET,
            z + target.normal[2] * FACE_OFFSET,
          ] as [number, number, number],
      ),
    [target],
  );
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
    const index: number[] = [];
    for (let i = 1; i < points.length - 1; i++) index.push(0, i, i + 1);
    g.setIndex(index);
    return g;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh geometry={geometry} renderOrder={999} raycast={noRaycast}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {points.length > 1 && (
        <Line points={[...points, points[0]]} color={color} lineWidth={2.5} depthTest={false} renderOrder={1000} raycast={noRaycast} />
      )}
    </group>
  );
}

export default function ComponentHighlight({ layout }: { layout: HallLayout }) {
  const selected = useComponentSelection((s) => s.selected);
  const color = useAccentColor();
  const invalidate = useThree((s) => s.invalidate);
  const target = useMemo(() => (selected ? highlightTarget(selected, layout) : null), [selected, layout]);
  useEffect(() => {
    invalidate();
  }, [target, color, invalidate]);
  if (!target) return null;
  return target.type === 'instances' ? <Instances target={target} color={color} /> : <Face target={target} color={color} />;
}
