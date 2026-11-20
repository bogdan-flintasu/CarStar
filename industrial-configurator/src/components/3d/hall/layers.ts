/**
 * Layers of the 3D hall (T3d): groups of components the user can hide from the view toolbar ("Straturi").
 * Each layer is one or more scene groups marked `userData.hallLayer = <id>` (`layerProps`), whose `visible` follows the
 * view store. Hidden layers are not drawn and not pickable (both pickers skip invisible objects). Quote renders show
 * every layer (`showAllLayers`, called from renders.tsx's pass).
 */

export const HALL_LAYERS = ['steel', 'walls', 'roof', 'openings', 'foundation', 'rainwater'] as const;
export type HallLayerId = (typeof HALL_LAYERS)[number];
export type LayerVisibility = Readonly<Record<HallLayerId, boolean>>;

export const LAYER_LABELS: Record<HallLayerId, string> = {
  steel: 'Structură',
  walls: 'Pereți',
  roof: 'Acoperiș',
  openings: 'Goluri',
  foundation: 'Fundație',
  rainwater: 'Apă pluvială',
};

/** What each layer holds, as the scene groups / kit pieces drawn in it (documentation and tests). */
export const LAYER_CONTENTS: Record<HallLayerId, readonly string[]> = {
  steel: ['Column', 'BasePlate', 'EaveHaunch', 'EaveHaunchHigh', 'Rafter', 'RidgeJoint', 'GirtCleat', 'Purlin', 'PurlinCleat', 'Bolts'],
  walls: ['PereteFata', 'PereteSpate', 'PereteSTG', 'PereteDR', 'CornerTrims'],
  roof: ['Roof', 'RidgeCap', 'EaveFlashing', 'HighEdgeFlashing'],
  openings: ['WallOpenings'],
  foundation: ['Slab'],
  rainwater: ['Gutter', 'GutterOutlet', 'GutterEndCap', 'Downpipe', 'DownpipeShoe', 'DownpipeOutlet'],
};

export const ALL_LAYERS_VISIBLE: LayerVisibility = {
  steel: true,
  walls: true,
  roof: true,
  openings: true,
  foundation: true,
  rainwater: true,
};

/** userData key of a layer group. */
export const HALL_LAYER = 'hallLayer';

/** Props of a layer's group: its marker and its visibility. */
export function layerProps(id: HallLayerId, layers: LayerVisibility = ALL_LAYERS_VISIBLE) {
  return { name: `Layer:${id}`, userData: { [HALL_LAYER]: id }, visible: layers[id] } as const;
}

/** The layer an object belongs to (its own or its nearest marked ancestor), or null. */
export function layerOf(object: { userData: Record<string, unknown>; parent: unknown }): HallLayerId | null {
  for (let o = object as typeof object | null; o; o = o.parent as typeof object | null) {
    const id = o.userData[HALL_LAYER];
    if (typeof id === 'string' && (HALL_LAYERS as readonly string[]).includes(id)) return id as HallLayerId;
  }
  return null;
}

export const allLayersVisible = (layers: LayerVisibility) => HALL_LAYERS.every((id) => layers[id]);

/** Something with a visibility flag and a marker: an Object3D, or a plain object in tests. */
export interface LayerNode {
  visible: boolean;
  userData: Record<string, unknown>;
}

/** The renderer setting that turns per-material clipping planes (the section cut) on or off. */
export interface ClippingSwitch {
  localClippingEnabled: boolean;
}

/**
 * The quote pass's render state: every layer group shown and the section cut off (no clipping planes), whatever the
 * live view shows. Returns the function that puts the live state back exactly as it was.
 */
export function quoteRenderState(nodes: Iterable<LayerNode>, renderer: ClippingSwitch): () => void {
  const hidden: LayerNode[] = [];
  for (const node of nodes) {
    if (node.userData[HALL_LAYER] && !node.visible) {
      hidden.push(node);
      node.visible = true;
    }
  }
  const clipping = renderer.localClippingEnabled;
  renderer.localClippingEnabled = false;
  return () => {
    for (const node of hidden) node.visible = false;
    renderer.localClippingEnabled = clipping;
  };
}
