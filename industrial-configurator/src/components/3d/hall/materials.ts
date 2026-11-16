'use client';

/**
 * The hall's materials: the kit's `Steel`, `Panel` and `Concrete` with their texture maps attached.
 * The asset names its maps in each material's `extras` (ASSET_CONTRACT.md section 5); nothing is chosen by mesh name.
 * Everything created here is set up once, in a memo, and disposed when the scene unmounts.
 */
import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { RepeatWrapping, SRGBColorSpace, type Material, type MeshStandardMaterial, type Texture } from 'three';
import type { HallKit } from './kit';

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const;
type MapSlot = (typeof MAP_SLOTS)[number];
type Maps = Partial<Record<MapSlot, Texture>>;

/** Steel and concrete textures cover 1 m per tile: kit UVs are in metres. */
const METRES_PER_TILE = 1;
/** The panel texture shows five 1 m cladding sheets side by side. */
const PANEL_METRES_PER_TILE = 5;
const QUARTER_TURN = Math.PI / 2;

export interface HallMaterials {
  steel: Material;
  /** Wall cladding: sheet joints run up the wall. */
  wall: Material;
  /** Roof cladding: sheet joints run down the slope. */
  roof: Material;
  concrete: Material;
}

interface HallMaterialOptions {
  /** Put the concrete maps on the slab. Off in the configurator, where the slab is plain grey. */
  texturedConcrete?: boolean;
}

function mapUrls(material: Material): Partial<Record<MapSlot, string>> {
  const named = MAP_SLOTS.filter((slot) => typeof material.userData[slot] === 'string');
  return Object.fromEntries(named.map((slot) => [slot, material.userData[slot] as string]));
}

/** A copy of `base` with its own copies of `maps`, tiled every `metresPerTile` and optionally turned 90 degrees. */
function textured(base: Material, maps: Maps, metresPerTile: number, rotation = 0): MeshStandardMaterial {
  const material = base.clone() as MeshStandardMaterial;
  for (const slot of MAP_SLOTS) {
    const source = maps[slot];
    if (!source) continue;
    const texture = source.clone();
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.setScalar(1 / metresPerTile);
    texture.rotation = rotation;
    if (slot === 'map') texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    material[slot] = texture;
  }
  return material;
}

function disposeMaterial(material: Material): void {
  for (const slot of MAP_SLOTS) (material as MeshStandardMaterial)[slot]?.dispose();
  material.dispose();
}

export function useHallMaterials(kit: HallKit, { texturedConcrete = false }: HallMaterialOptions = {}): HallMaterials {
  const { Steel, Panel, Concrete } = kit.materials;
  // The url objects are memoised because useTexture returns a new result whenever its input object changes.
  const urls = useMemo(
    () => ({ steel: mapUrls(Steel), panel: mapUrls(Panel), concrete: texturedConcrete ? mapUrls(Concrete) : {} }),
    [Steel, Panel, Concrete, texturedConcrete],
  );
  const steelMaps: Maps = useTexture(urls.steel);
  const panelMaps: Maps = useTexture(urls.panel);
  const concreteMaps: Maps = useTexture(urls.concrete);

  const materials = useMemo<HallMaterials>(
    () => ({
      steel: textured(Steel, steelMaps, METRES_PER_TILE),
      wall: textured(Panel, panelMaps, PANEL_METRES_PER_TILE),
      roof: textured(Panel, panelMaps, PANEL_METRES_PER_TILE, QUARTER_TURN),
      concrete: textured(Concrete, concreteMaps, METRES_PER_TILE),
    }),
    [Steel, Panel, Concrete, steelMaps, panelMaps, concreteMaps],
  );

  useEffect(() => () => Object.values(materials).forEach(disposeMaterial), [materials]);

  return materials;
}
