import { describe, expect, it } from 'vitest';
import { sectionPlane } from './section';
import { filterPickHits, isHitCutAway, isShownNode, SECTION_CLIP, setLivePickPlane, type PickNode } from './sectionPick';

const node = (userData: Record<string, unknown> = {}, parent: PickNode | null = null, visible = true): PickNode => ({ visible, userData, parent });
const plane = sectionPlane('transversal', 0.5, { x: [-5, 5], z: [-10, 10] })!; // cuts away z > 0

describe('section picking', () => {
  const clipped = node({ [SECTION_CLIP]: true });
  const steel = node({}, clipped);
  const handle = node(); // the cut's own handle: never clipped

  it('skips hits on the cut-away side of clipped parts only', () => {
    expect(isHitCutAway({ object: steel, point: [0, 1, 3] }, plane)).toBe(true);
    expect(isHitCutAway({ object: steel, point: [0, 1, -3] }, plane)).toBe(false);
    expect(isHitCutAway({ object: handle, point: [0, 1, 3] }, plane)).toBe(false);
    expect(isHitCutAway({ object: steel, point: [0, 1, 3] }, null)).toBe(false);
  });

  it('skips hidden objects (a hidden layer) and keeps the order', () => {
    const hiddenLayer = node({}, clipped, false);
    const inHidden = node({}, hiddenLayer);
    expect(isShownNode(inHidden)).toBe(false);
    const hits = [
      { object: steel, point: [0, 1, 4] as [number, number, number], id: 'cut' },
      { object: inHidden, point: [0, 1, -1] as [number, number, number], id: 'hidden' },
      { object: steel, point: [0, 1, -2] as [number, number, number], id: 'kept1' },
      { object: handle, point: [0, 1, 5] as [number, number, number], id: 'kept2' },
    ];
    expect(filterPickHits(hits, plane).map((h) => h.id)).toEqual(['kept1', 'kept2']);
  });

  it('uses the live plane set by the section cut', () => {
    const hit = { object: steel, point: [0, 1, 3] as [number, number, number] };
    setLivePickPlane(plane);
    expect(filterPickHits([hit])).toEqual([]);
    setLivePickPlane(null);
    expect(filterPickHits([hit])).toEqual([hit]);
  });
});
