'use client';

/**
 * Dev-only verification hook (D10): `/configurator?w=13.5&h=4&l=30&step=1` sets the hall's dimensions and the
 * wizard step once, on mount. Values are clamped to HALL_LIMITS. Does nothing in a production build.
 */
import { useEffect } from 'react';
import { parseHallUrlParams } from '@/lib/hall';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';

export function useHallUrlParams(): void {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const { width, height, length, step } = parseHallUrlParams(window.location.search);
    const store = useConfiguratorStore.getState();
    if (step !== undefined) store.setStep(step);
    if (width !== undefined) store.setWidth(width);
    if (height !== undefined) store.setHeight(height);
    if (length !== undefined) store.setLength(length);
  }, []);
}
