import { describe, expect, it } from 'vitest';
import { Group, Mesh } from 'three';
import {
  ALL_LAYERS_VISIBLE,
  allLayersVisible,
  HALL_LAYER,
  HALL_LAYERS,
  LAYER_CONTENTS,
  LAYER_LABELS,
  layerOf,
  layerProps,
  quoteRenderState,
  type LayerNode,
} from './layers';
import { GUTTER_PIECES, RAINWATER_PIECES, ROOF_FLASHING_PIECES } from './Steel';

describe('layers', () => {
  it('has the six Romanian layers, all on by default', () => {
    expect(HALL_LAYERS.map((id) => LAYER_LABELS[id])).toEqual(['Structură', 'Pereți', 'Acoperiș', 'Goluri', 'Fundație', 'Apă pluvială']);
    expect(allLayersVisible(ALL_LAYERS_VISIBLE)).toBe(true);
    expect(allLayersVisible({ ...ALL_LAYERS_VISIBLE, roof: false })).toBe(false);
  });

  it('maps every rainwater piece to exactly one layer: gutters and downpipes to "Apă pluvială", the ridge cap to the roof', () => {
    expect([...GUTTER_PIECES, ...ROOF_FLASHING_PIECES].sort()).toEqual([...RAINWATER_PIECES].sort());
    expect(LAYER_CONTENTS.rainwater).toEqual([...GUTTER_PIECES]);
    expect(LAYER_CONTENTS.roof).toContain('RidgeCap');
    const all = HALL_LAYERS.flatMap((id) => LAYER_CONTENTS[id]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('marks a layer group and follows its visibility', () => {
    const props = layerProps('walls', { ...ALL_LAYERS_VISIBLE, walls: false });
    expect(props).toMatchObject({ name: 'Layer:walls', visible: false, userData: { [HALL_LAYER]: 'walls' } });
    expect(layerProps('steel').visible).toBe(true);
  });

  it('finds the layer of an object from its nearest marked ancestor', () => {
    const group = new Group();
    Object.assign(group, layerProps('roof'));
    const mesh = new Mesh();
    group.add(mesh);
    expect(layerOf(mesh)).toBe('roof');
    expect(layerOf(new Mesh())).toBeNull();
  });
});

describe('quoteRenderState', () => {
  it('shows every layer and switches clipping off, then restores the live state exactly', () => {
    const nodes: LayerNode[] = [
      { visible: false, userData: { [HALL_LAYER]: 'steel' } },
      { visible: true, userData: { [HALL_LAYER]: 'roof' } },
      { visible: false, userData: {} }, // not a layer: left alone
    ];
    const renderer = { localClippingEnabled: true };
    const restore = quoteRenderState(nodes, renderer);
    expect(nodes.map((n) => n.visible)).toEqual([true, true, false]);
    expect(renderer.localClippingEnabled).toBe(false);
    restore();
    expect(nodes.map((n) => n.visible)).toEqual([false, true, false]);
    expect(renderer.localClippingEnabled).toBe(true);
  });

  it('restores clipping off when it was off', () => {
    const renderer = { localClippingEnabled: false };
    quoteRenderState([], renderer)();
    expect(renderer.localClippingEnabled).toBe(false);
  });
});
