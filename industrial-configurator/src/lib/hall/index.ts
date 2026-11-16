export * from './constants';
export * from './types';
export { computeHallLayout } from './computeHallLayout';
export { clampHallDimensions, parseHallUrlParams, resolveHallParams } from './params';
export type { HallDimensions, HallUrlParams } from './params';
export { computeSection, panelThicknessOf } from './section';
export type { HallSection } from './section';
export { polygonArea, wallHeightAt, wallPointToWorld } from './walls';
