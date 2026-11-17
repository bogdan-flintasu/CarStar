'use client';

/**
 * Moving a whole hall in and out of the configurator: loading a saved configuration (shared link) or a predefined
 * model, and reading the current hall back as model data (the admin's "save as model").
 */
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { requestHallFraming } from '@/components/3d/hall/framing';
import type { HallModelData } from '@/lib/validation/models';

/** Loads a hall, replacing whatever was there. Openings are re-clamped to the new hall by the openings store. */
export function applyHallConfiguration(data: HallModelData, model: { id: string; name: string } | null = null): void {
  const hall = useConfiguratorStore.getState();
  const openings = useOpeningsStore.getState();

  // Start from a clean slate (back on step 1) so nothing from a previous session leaks in.
  hall.resetConfigurator();
  openings.resetOpenings();

  hall.setLength(data.dimensions.length);
  hall.setWidth(data.dimensions.width);
  hall.setHeight(data.dimensions.height);
  hall.setRoofType(data.roofType ?? 'gable');
  hall.setHighSide(data.highSide ?? 'right');
  hall.setShowFoundation(data.foundation);
  hall.setHasSandwichPanels(data.sandwichPanels);
  if (data.insulation > 0) {
    hall.setIsIsolated(true);
    hall.setInsulation(data.insulation);
  }
  hall.setColors(data.colors);
  hall.setModel(model);
  // setOpenings normalises legacy (posX/posY) openings itself, against the hall set above.
  openings.setOpenings(data.openingsList);

  requestHallFraming();
}

/** The hall currently in the configurator, in the shape a predefined model stores. */
export function currentHallData(): HallModelData {
  const s = useConfiguratorStore.getState();
  return {
    dimensions: { length: s.length, width: s.width, height: s.height },
    roofType: s.roofType,
    highSide: s.highSide,
    foundation: s.showFoundation,
    sandwichPanels: s.hasSandwichPanels,
    insulation: s.isIsolated ? s.insulation : 0,
    openingsList: useOpeningsStore.getState().openings.map(({ id, type, wallId, offsetX, sill, width, height }) => ({
      id,
      type,
      wallId,
      offsetX,
      sill,
      width,
      height,
    })),
    colors: s.colors,
  };
}
