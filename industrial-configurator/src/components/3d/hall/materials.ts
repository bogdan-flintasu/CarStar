'use client';

/**
 * The hall's materials.
 *   - steel: the kit's `Steel` with its relief maps (ASSET_CONTRACT.md section 5), painted in the steel colour;
 *   - wall / roof: painted cladding with a generated profile (claddingTextures.ts), in the wall / roof colour;
 *   - wallEdge: the cut edges of the wall panels (corners, opening reveals), plain wall colour, no profile;
 *   - trim: gutters, downpipes, ridge cap, corner and verge flashings, in the trim colour;
 *   - concrete: the kit's `Concrete`.
 * Textures are built once per hall; colour changes only update `material.color`, so recolouring is instant.
 */
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from 'three';
import { DEFAULT_COLOR_HEXES, type HallColorHexes } from '@/lib/colors';
import type { HallKit } from './kit';
import { profileMaps, ROOF_PROFILE, SHEET_PROFILE, WALL_PANEL_PROFILE } from './claddingTextures';

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const;
type MapSlot = (typeof MAP_SLOTS)[number];
type Maps = Partial<Record<MapSlot, Texture>>;

/** Steel and concrete textures cover 1 m per tile: kit UVs are in metres. */
const METRES_PER_TILE = 1;

/** Polyester-coated steel: a little metallic, a soft sheen. */
const PAINTED = { metalness: 0.25, roughness: 0.5 } as const;

export interface HallMaterials {
  steel: Material;
  /** Wall cladding faces. */
  wall: Material;
  /** Cut edges of the wall panels. */
  wallEdge: Material;
  /** Roof cladding: ribs run down the slope. */
  roof: Material;
  /** Rainwater goods and flashings. */
  trim: Material;
  concrete: Material;
}

interface HallMaterialOptions {
  /** Put the concrete maps on the slab. Off in the configurator, where the slab is plain grey. */
  texturedConcrete?: boolean;
  /** Sandwich panels (horizontal, micro-lined) instead of trapezoidal sheeting on the walls. */
  panels?: boolean;
  colors?: HallColorHexes;
}

/** The steel keeps only the relief of its maps; its colour is the customer's. */
const STEEL_SLOTS: readonly MapSlot[] = ['normalMap', 'roughnessMap'];

function mapUrls(material: Material, slots: readonly MapSlot[] = MAP_SLOTS): Partial<Record<MapSlot, string>> {
  const named = slots.filter((slot) => typeof material.userData[slot] === 'string');
  return Object.fromEntries(named.map((slot) => [slot, material.userData[slot] as string]));
}

/** A copy of `base` with its own copies of `maps`, tiled every `metresPerTile`. */
function textured(base: Material, maps: Maps, metresPerTile: number): MeshStandardMaterial {
  const material = base.clone() as MeshStandardMaterial;
  for (const slot of MAP_SLOTS) {
    const source = maps[slot];
    if (!source) continue;
    const texture = source.clone();
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.setScalar(1 / metresPerTile);
    if (slot === 'map') texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    material[slot] = texture;
  }
  return material;
}

function painted(maps?: Maps): MeshStandardMaterial {
  return new MeshStandardMaterial({ ...PAINTED, ...maps });
}

function disposeMaterial(material: Material): void {
  for (const slot of MAP_SLOTS) (material as MeshStandardMaterial)[slot]?.dispose();
  material.dispose();
}

export function useHallMaterials(
  kit: HallKit,
  { texturedConcrete = false, panels = false, colors = DEFAULT_COLOR_HEXES }: HallMaterialOptions = {},
): HallMaterials {
  const { Steel, Concrete } = kit.materials;
  // The url objects are memoised because useTexture returns a new result whenever its input object changes.
  const urls = useMemo(
    () => ({ steel: mapUrls(Steel, STEEL_SLOTS), concrete: texturedConcrete ? mapUrls(Concrete) : {} }),
    [Steel, Concrete, texturedConcrete],
  );
  const steelMaps: Maps = useTexture(urls.steel);
  const concreteMaps: Maps = useTexture(urls.concrete);

  const materials = useMemo<HallMaterials>(() => {
    const steel = textured(Steel, steelMaps, METRES_PER_TILE);
    steel.metalness = PAINTED.metalness;
    return {
      steel,
      wall: painted(panels ? profileMaps(WALL_PANEL_PROFILE, 'v') : profileMaps(SHEET_PROFILE, 'u')),
      wallEdge: painted(),
      roof: painted(profileMaps(ROOF_PROFILE, 'v')),
      // Sheet metal seen from both sides: the inside of a gutter, and of a downpipe seen through its outlet hole.
      trim: Object.assign(painted(), { side: DoubleSide }),
      concrete: textured(Concrete, concreteMaps, METRES_PER_TILE),
    };
  }, [Steel, Concrete, steelMaps, concreteMaps, panels]);

  useEffect(() => () => Object.values(materials).forEach(disposeMaterial), [materials]);

  // Colours change without rebuilding anything; the canvas renders on demand, so ask for a frame.
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const paint = (material: Material, hex: string) => (material as MeshStandardMaterial).color.set(hex);
    paint(materials.steel, colors.steel);
    paint(materials.wall, colors.walls);
    paint(materials.wallEdge, colors.walls);
    paint(materials.roof, colors.roof);
    paint(materials.trim, colors.trims);
    invalidate();
  }, [materials, colors.steel, colors.walls, colors.roof, colors.trims, invalidate]);

  return materials;
}
