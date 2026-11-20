'use client';

/**
 * A steel portal-frame hall, drawn from a HallLayout (src/lib/hall): this file only says what a hall is made of.
 * Sizes and positions come from the layout, shapes from the kit; nothing is measured or adjusted here.
 * Suspends while the kit and its textures load.
 */
import { useEffect, useMemo } from 'react';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import type { HallLayout, LegacyWallId } from '@/lib/hall';
import { KIT_PIECES, useHallKit, type HallKit, type KitDetail } from './kit';
import { useHallMaterials } from './materials';
import { placeKit, type KitPlacements } from './placements';
import { estimateHallCost, type HallCost } from './qualityLod';
import { useQualityStore } from './qualityStore';
import { Roof, Slab } from './Roof';
import { Bolts, Frames, GUTTER_PIECES, Purlins, RAINWATER_PIECES, ROOF_FLASHING_PIECES, Rainwater } from './Steel';
import { ALL_LAYERS_VISIBLE, layerProps, type LayerVisibility } from './layers';
import Trims from './Trims';
import Walls, { type WallHole } from './Walls';
import type { HallColorHexes } from '@/lib/colors';

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
  /** Colour per component; the catalogue defaults when omitted. */
  colors?: HallColorHexes;
  /** T3d: which layers are drawn (layers.ts); all by default. Openings are drawn outside the hall (WallOpenings). */
  layers?: LayerVisibility;
}

/** Bolts and rainwater goods never cast shadows (Steel.tsx, below). */
const NO_SHADOW_PIECES = new Set<string>(['Bolt', ...RAINWATER_PIECES]);
const trianglesOf = (geometry: HallKit['pieces'][keyof HallKit['pieces']]['geometry']) =>
  (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;

/** What this hall costs to draw with every piece shown (qualityLod.ts): the governor's starting point. */
function hallCost(kit: HallKit, placements: KitPlacements, steelCastsShadow: boolean): HallCost {
  const bolts = KIT_PIECES.reduce(
    (sum, name) =>
      sum +
      placements[name].reduce(
        (n, { openSide }) => n + kit.pieces[name].sockets.filter((s) => s.side === undefined || s.side !== openSide).length,
        0,
      ),
    0,
  );
  return estimateHallCost(
    KIT_PIECES.map((name) => ({
      name,
      instances: name === 'Bolt' ? bolts : placements[name].length,
      trianglesEach: trianglesOf(kit.pieces[name].geometry),
      castsShadow: steelCastsShadow && !NO_SHADOW_PIECES.has(name),
    })),
  );
}

export default function Hall({
  layout,
  claddingVisible = true,
  detail = 'full',
  holes,
  onWallHover,
  texturedConcrete,
  colors,
  layers = ALL_LAYERS_VISIBLE,
}: HallProps) {
  const kit = useHallKit(detail);
  const materials = useHallMaterials(kit, { texturedConcrete, panels: layout.params.panels, colors });
  const placements = useMemo(() => placeKit(layout), [layout]);
  // Under the cladding the steel is in its shade anyway: only the outermost visible shell casts shadows.
  const steel = { kit, placements, material: materials.steel, castShadow: !claddingVisible };

  useEffect(() => {
    useQualityStore.getState().setCost(hallCost(kit, placements, !claddingVisible));
  }, [kit, placements, claddingVisible]);

  // Hall mounts only once the kit has loaded (it suspends until then): report ready after its first frame.
  useEffect(() => {
    const { setHallReady } = useConfiguratorStore.getState();
    const raf = requestAnimationFrame(() => setHallReady(true));
    return () => {
      cancelAnimationFrame(raf);
      setHallReady(false);
    };
  }, []);

  return (
    <group name="Hall">
      <group {...layerProps('steel', layers)}>
        <Frames {...steel} />
        <Purlins {...steel} />
        <Bolts {...steel} />
      </group>

      <group name="Cladding" visible={claddingVisible}>
        <group {...layerProps('walls', layers)}>
          <Walls
            layout={layout}
            material={materials.wall}
            edgeMaterial={materials.wallEdge}
            holes={holes}
            onHover={claddingVisible && layers.walls ? onWallHover : undefined}
          />
        </group>
        <group {...layerProps('roof', layers)}>
          <Roof layout={layout} material={materials.roof} edgeMaterial={materials.trim} />
          <Rainwater {...steel} pieces={ROOF_FLASHING_PIECES} material={materials.trim} castShadow={false} />
        </group>
        <Trims layout={layout} material={materials.trim} corners={layers.walls} edges={layers.roof} />
        <group {...layerProps('rainwater', layers)}>
          <Rainwater {...steel} pieces={GUTTER_PIECES} material={materials.trim} castShadow={false} />
        </group>
      </group>

      {layout.params.foundation && (
        <group {...layerProps('foundation', layers)}>
          <Slab slab={layout.slab} material={materials.concrete} />
        </group>
      )}
    </group>
  );
}
