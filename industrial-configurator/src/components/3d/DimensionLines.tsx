'use client';

import { useMemo } from 'react';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

interface DimensionLinesProps {
  length: number;
  width: number;
  height: number;
  visible: boolean;
}

export default function DimensionLines({ length, width, height, visible }: DimensionLinesProps) {
  const lineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#F5A623', linewidth: 2, depthTest: false }),
    []
  );
  
  if (!visible) return null;

  const yOffset = 0.5; // Height of text above lines
  const xOffset = 1.5; // Offset from building to avoid overlap
  const zOffset = 1.5;

  return (
    <group renderOrder={999}>
      {/* --- Length (Z-axis) --- */}
      {/* Main dimension line */}
      <Line
        points={[
          [width / 2 + xOffset, 0.1, 0],
          [width / 2 + xOffset, 0.1, -length]
        ]}
        color="#F5A623"
        lineWidth={2}
        depthTest={false}
        renderOrder={999}
      />
      {/* End ticks */}
      <Line points={[[width / 2 + xOffset - 0.5, 0.1, 0], [width / 2 + xOffset + 0.5, 0.1, 0]]} color="#F5A623" depthTest={false} renderOrder={999} />
      <Line points={[[width / 2 + xOffset - 0.5, 0.1, -length], [width / 2 + xOffset + 0.5, 0.1, -length]]} color="#F5A623" depthTest={false} renderOrder={999} />
      
      {/* Label */}
      <Text
        position={[width / 2 + xOffset, yOffset, -length / 2]}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        fontSize={0.8}
        color="#F5A623"
        anchorX="center"
        anchorY="bottom"
        material-depthTest={false}
        renderOrder={1000}
      >
        L = {length}m
      </Text>

      {/* --- Width (X-axis) --- */}
      {/* Main dimension line */}
      <Line
        points={[
          [width / 2, 0.1, zOffset],
          [-width / 2, 0.1, zOffset]
        ]}
        color="#F5A623"
        lineWidth={2}
        depthTest={false}
        renderOrder={999}
      />
      {/* End ticks */}
      <Line points={[[width / 2, 0.1, zOffset - 0.5], [width / 2, 0.1, zOffset + 0.5]]} color="#F5A623" depthTest={false} renderOrder={999} />
      <Line points={[[-width / 2, 0.1, zOffset - 0.5], [-width / 2, 0.1, zOffset + 0.5]]} color="#F5A623" depthTest={false} renderOrder={999} />
      
      {/* Label */}
      <Text
        position={[0, yOffset, zOffset]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.8}
        color="#F5A623"
        anchorX="center"
        anchorY="bottom"
        material-depthTest={false}
        renderOrder={1000}
      >
        l = {width}m
      </Text>

      {/* --- Height (Y-axis) --- */}
      {/* Vertical line placed at one of the corners */}
      <Line
        points={[
          [-width / 2 - xOffset, 0, 0],
          [-width / 2 - xOffset, height, 0]
        ]}
        color="#F5A623"
        lineWidth={2}
        depthTest={false}
        renderOrder={999}
      />
      {/* End ticks */}
      <Line points={[[-width / 2 - xOffset - 0.5, 0, 0], [-width / 2 - xOffset + 0.5, 0, 0]]} color="#F5A623" depthTest={false} renderOrder={999} />
      <Line points={[[-width / 2 - xOffset - 0.5, height, 0], [-width / 2 - xOffset + 0.5, height, 0]]} color="#F5A623" depthTest={false} renderOrder={999} />
      
      {/* Label */}
      <Text
        position={[-width / 2 - xOffset, height / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.8}
        color="#F5A623"
        anchorX="center"
        anchorY="bottom"
        material-depthTest={false}
        renderOrder={1000}
      >
        H = {height}m
      </Text>

      {/* --- pillars spacing / Step (Z-axis, left side, 0 to -6) --- */}
      {/* Main dimension line */}
      <Line
        points={[
          [-width / 2 - xOffset, 0.1, 0],
          [-width / 2 - xOffset, 0.1, -6]
        ]}
        color="#F5A623"
        lineWidth={2}
        depthTest={false}
        renderOrder={999}
      />
      {/* End ticks */}
      <Line points={[[-width / 2 - xOffset - 0.5, 0.1, 0], [-width / 2 - xOffset + 0.5, 0.1, 0]]} color="#F5A623" depthTest={false} renderOrder={999} />
      <Line points={[[-width / 2 - xOffset - 0.5, 0.1, -6], [-width / 2 - xOffset + 0.5, 0.1, -6]]} color="#F5A623" depthTest={false} renderOrder={999} />
      
      {/* Label */}
      <Text
        position={[-width / 2 - xOffset, yOffset, -3]}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        fontSize={0.8}
        color="#F5A623"
        anchorX="center"
        anchorY="bottom"
        material-depthTest={false}
        renderOrder={1000}
      >
        Pas = 6m
      </Text>

    </group>
  );
}
