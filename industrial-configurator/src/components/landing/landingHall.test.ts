import { describe, expect, it } from 'vitest';
import { validateOpenings, wallSpansFromLayout } from '@/components/3d/openings/validateOpenings';
import { clampOpening } from '@/components/3d/openings/openingMath';
import { LANDING_LAYOUT, LANDING_OPENINGS } from './landingHall';

describe('landing hall', () => {
  it('has windows, industrial doors and personnel doors on every wall', () => {
    const types = new Set(LANDING_OPENINGS.map((o) => o.type));
    expect(types).toEqual(new Set(['window', 'door', 'garageDoor']));
    expect(new Set(LANDING_OPENINGS.map((o) => o.wallId)).size).toBe(4);
    expect(new Set(LANDING_OPENINGS.map((o) => o.id)).size).toBe(LANDING_OPENINGS.length);
  });

  it('passes the configurator validation: no opening on a column, a downpipe or another opening', () => {
    expect(validateOpenings(LANDING_OPENINGS, wallSpansFromLayout(LANDING_LAYOUT))).toEqual([]);
  });

  it('fits its walls as placed (clamping changes nothing)', () => {
    const spans = wallSpansFromLayout(LANDING_LAYOUT);
    for (const o of LANDING_OPENINGS) expect(clampOpening(o, spans[o.wallId])).toMatchObject(o);
  });
});
