/** Central Romanian UI labels. Add new shared strings here instead of repeating them in components. */
export const WALL_LABELS_RO: Record<string, string> = {
  PereteFata: 'Față',
  PereteSpate: 'Spate',
  PereteSTG: 'Stânga',
  PereteDR: 'Dreapta',
};

export const wallLabelRo = (wallId: string): string => WALL_LABELS_RO[wallId] ?? wallId;
