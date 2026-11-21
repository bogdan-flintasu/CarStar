'use client';

/**
 * The look of the walk-through (docs/plans/walkthrough.md, "Look" and "Scenery"): while the user walks, the live
 * scene gets the quote render's summer sky and sun, the site (asphalt, parking, road) with its props, and props
 * inside the hall (forklift, pallets, racks, workers). Everything loads after entering, so walking starts at once;
 * leaving puts every setting back (the same `applyStaging` the quote pictures use) and frees what was built.
 * Live-friendly: the shadow map follows the live quality ladder, no ambient-occlusion pass.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { HemisphereLight, type Group } from 'three';
import type { HallLayout } from '@/lib/hall';
import { planSite } from '@/lib/hall/sitePlan';
import { planInteriorProps, planProps } from '@/lib/hall/propPlan';
import { renderViewCameras, sunForView } from '@/lib/hall/renderViews';
import { buildWalkPlan } from '@/lib/hall/walkPlan';
import { loadRenderSky } from '@/components/3d/stage/sky';
import { buildSite, disposeSite } from '@/components/3d/stage/site';
import { buildProps, disposeProps, loadPropAssets } from '@/components/3d/stage/props';
import { applyStaging } from '@/components/3d/stage/staging';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { useWalkStore } from '@/stores/useWalkStore';
import { useLiveQuality } from '@/components/3d/hall/qualityStore';

/** Shadows cover the hall and this much around it (metres): inside and just outside the doors is what matters. */
const SHADOW_MARGIN = 10;
/** Soft fill so the far end of a long hall without windows is not dark (the sky light alone stops at the roof). */
const FILL = { sky: '#f4f1ea', ground: '#7d7a72', intensity: 0.55 } as const;

export default function WalkStaging({ layout }: { layout: HallLayout }) {
  const { gl, scene, invalidate } = useThree();
  const walking = useWalkStore((s) => s.phase !== 'off');
  const shadowMapSize = useLiveQuality().shadowMapSize;

  useEffect(() => {
    if (!walking) return;
    let cancelled = false;
    let restore: (() => void) | null = null;
    let site: Group | null = null;
    const props: Group[] = [];
    const fill = new HemisphereLight(FILL.sky, FILL.ground, FILL.intensity);
    fill.name = 'WalkFill';

    (async () => {
      const openings = useOpeningsStore.getState().openings;
      const plan = planSite(layout, openings);
      const [sky, builtSite, assets] = await Promise.all([loadRenderSky(gl), buildSite(plan, layout.groundY), loadPropAssets()]);
      if (cancelled) {
        disposeSite(builtSite);
        return;
      }
      site = builtSite;
      const walk = buildWalkPlan(layout, openings);
      const outdoor = buildProps(planProps(plan, []), assets, layout.groundY);
      const keepClear = walk.teleports.map((t) => ({ x: t.position[0], z: t.position[1], r: 1.2 }));
      const indoor = buildProps(planInteriorProps(layout, openings, keepClear), assets, layout.slab.topY);
      props.push(outdoor, indoor);
      site.add(outdoor, indoor);

      const cameras = renderViewCameras(layout, 16 / 9);
      const { min, max } = layout.bounds;
      restore = applyStaging(scene, gl, {
        sky,
        sun: sunForView(cameras.front, layout),
        cameraDistance: 0,
        site,
        shadowArea: { x0: min[0] - SHADOW_MARGIN, x1: max[0] + SHADOW_MARGIN, z0: min[2] - SHADOW_MARGIN, z1: max[2] + SHADOW_MARGIN },
        shadowMapSize,
        shadowRadius: 2,
      });
      // After the staging, which turns the live flat lights down.
      scene.add(fill);
      useWalkStore.getState().setSceneryLoaded(true);
      invalidate();
    })().catch((error) => {
      // Without the scenery the walk still works, in the live view's look.
      console.warn('Walk-through scenery could not be loaded', error);
    });

    return () => {
      cancelled = true;
      scene.remove(fill);
      restore?.();
      for (const group of props) {
        site?.remove(group);
        disposeProps(group);
      }
      if (site) disposeSite(site);
      useWalkStore.getState().setSceneryLoaded(false);
      invalidate();
    };
    // Built once per walk: the hall cannot change while walking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking]);

  return null;
}
