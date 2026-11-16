'use client';

/**
 * A steel portal-frame hall, drawn from a HallLayout (src/lib/hall): this file only says what a hall is made of.
 * Sizes and positions come from the layout, shapes from the kit; nothing is measured or adjusted here.
 * Suspends while the kit and its textures load.
 */
import { useMemo } from 'react';
import type { HallLayout, LegacyWallId } from '@/lib/hall';
import { useHallKit, type KitDetail } from './kit';
import { useHallMaterials } from './materials';
import { placeKit } from './placements';
import { Roof, Slab } from './Roof';
import { Bolts, Frames, Purlins, Rainwater } from './Steel';
import Walls, { type WallHole } from './Walls';

export interface HallProps {
  layout: HallLayout;
  /** Walls, roof and rainwater goods. Hidden, the bare steel frame is shown (and casts the shadows). */
  claddingVisible?: boolean;
  /** `light` draws the low-poly kit without bolts. */
  detail?: KitDetail;
  /** Openings to cut out of the walls. */
  holes?: readonly WallHole[];
  onWallHover?: (wallId: LegacyWallId | null) => void;
  texturedConcrete?: boolean;
}

export default function Hall({ layout, claddingVisible = true, detail = 'full', holes, onWallHover, texturedConcrete }: HallProps) {
  const kit = useHallKit(detail);
  const materials = useHallMaterials(kit, { texturedConcrete });
  const placements = useMemo(() => placeKit(layout), [layout]);
  // Under the cladding the steel is in its shade anyway: only the outermost visible shell casts shadows.
  const steel = { kit, placements, material: materials.steel, castShadow: !claddingVisible };

  return (
    <group name="Hall">
      <Frames {...steel} />
      <Purlins {...steel} />
      <Bolts {...steel} />

      <group name="Cladding" visible={claddingVisible}>
        <Walls layout={layout} material={materials.wall} holes={holes} onHover={claddingVisible ? onWallHover : undefined} />
        <Roof layout={layout} material={materials.roof} />
        <Rainwater {...steel} castShadow={false} />
      </group>

      {layout.params.foundation && <Slab slab={layout.slab} material={materials.concrete} />}
    </group>
  );
}
