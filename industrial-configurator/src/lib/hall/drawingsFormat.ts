/**
 * Number formatting shared by every consumer of the drawings (3D dimension chains, PDF elevations, DXF):
 * metres with at most two decimals, Romanian style (comma as the decimal separator, no trailing zeros).
 */

/** Rounds to the millimetre and never returns -0. */
export function roundMm(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

/** `7.5` -> `7,5`, `12` -> `12`, `5.714` -> `5,71`, `0.005` -> `0,01`. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = String(rounded === 0 ? 0 : rounded);
  return text.replace('.', ',');
}

/** `7.5` -> `7,5 m`. */
export function formatMetres(value: number): string {
  return `${formatNumber(value)} m`;
}

/** Width × height of an opening: `1,2 × 1,5 m`. */
export function formatSize(width: number, height: number): string {
  return `${formatNumber(width)} × ${formatNumber(height)} m`;
}
