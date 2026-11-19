/**
 * The content of a PDF quote ("ofertă estimativă"), as plain data: what is written where, already formatted in
 * Romanian. Pure and deterministic (the date is passed in), so it is unit-tested apart from the PDF drawing
 * (src/app/api/_lib/quotePdf.tsx), which only lays this out.
 *
 * The configuration must already be priced on the server (`withServerPrice`): the price is taken as is.
 */
import { contactLines, type Branding } from '@/lib/branding';
import { COLOR_COMPONENTS, COMPONENT_LABELS, defaultColors } from '@/lib/colors';
import { buildDrawing, clampHallDimensions, computeHallLayout, type Drawing, type DrawingOpening } from '@/lib/hall';
import { RENDER_VIEW_LABELS, type RenderView } from '@/lib/hall/renderViews';
import { wallLabelRo } from '@/lib/i18n/ro';
import { renderCreditLine } from '@/lib/renderCredits';
import type { ConfigurationData } from '@/lib/validation/configuration';
import type { QuoteSettings } from './settings';

export interface QuoteRow {
  label: string;
  value: string;
}

export interface QuoteColorRow extends QuoteRow {
  hex: string;
}

export interface QuoteOpeningRow {
  type: string;
  wall: string;
  size: string;
  count: number;
}

export interface QuoteImage {
  view: RenderView;
  label: string;
}

export interface QuoteModel {
  company: { name: string; logoPath: string | null; contact: string[]; colors: Branding['colors'] };
  title: string;
  offerNumber: string;
  date: string;
  images: { hero: QuoteImage | null; others: QuoteImage[] };
  specification: QuoteRow[];
  colors: QuoteColorRow[];
  openings: QuoteOpeningRow[];
  price: { label: string; amount: number; formatted: string; vatNote: string };
  disclaimer: string[];
  link: string;
  filename: string;
  /** The hall as drawn on the drawing pages: the front, one side, the plan and the cross-section. */
  drawings: Drawing[];
}

export interface QuoteInput {
  token: string;
  /** Server-priced configuration. */
  data: ConfigurationData;
  /** When the quote is issued. */
  date: Date;
  /** Public link of the configuration. */
  link: string;
  /** Views that have a stored picture. */
  renderViews: readonly RenderView[];
  branding: Branding;
  settings: QuoteSettings;
}

const OPENING_LABELS: Record<string, string> = { window: 'Fereastră', door: 'Ușă', garageDoor: 'Ușă industrială' };
const OPENING_ORDER = ['garageDoor', 'door', 'window'];
const WALL_ORDER = ['PereteFata', 'PereteSpate', 'PereteSTG', 'PereteDR'];

/** 1234.5 → "1.234,5": Romanian grouping and decimal comma, at most `decimals` decimals. */
export function formatNumberRo(value: number, decimals = 2): string {
  let fixed = Math.abs(value).toFixed(decimals);
  if (fixed.includes('.')) fixed = fixed.replace(/\.?0+$/, '');
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;
}

/** Whole euros: "12.345 €". */
export const formatEuro = (value: number) => `${formatNumberRo(Math.round(value), 0)} €`;

/** dd.mm.yyyy in Romanian time. */
export function formatDateRo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}.${part('month')}.${part('year')}`;
}

export const quoteFilename = (token: string) => `oferta-hala-${token}.pdf`;
export const offerNumber = (token: string) => `OF-${token}`;

export function roofText(data: Pick<ConfigurationData, 'roofType' | 'highSide'>): string {
  if (data.roofType !== 'mono') return 'În două ape';
  return `Într-o apă, latura înaltă în ${data.highSide === 'left' ? 'stânga' : 'dreapta'}`;
}

function claddingText(data: ConfigurationData): string {
  if (!data.sandwichPanels) return 'Fără panouri sandwich';
  return data.insulation > 0 ? `Panouri sandwich, izolație ${data.insulation} mm` : 'Panouri sandwich';
}

/** Openings grouped by type, wall and size, with how many of each. */
export function openingRows(list: ConfigurationData['openingsList']): QuoteOpeningRow[] {
  const groups = new Map<string, QuoteOpeningRow & { order: number[] }>();
  for (const o of list) {
    const size = `${formatNumberRo(o.width)} × ${formatNumberRo(o.height)} m`;
    const key = `${o.type}|${o.wallId}|${size}`;
    const row = groups.get(key);
    if (row) row.count += 1;
    else {
      groups.set(key, {
        type: OPENING_LABELS[o.type] ?? o.type,
        wall: wallLabelRo(o.wallId),
        size,
        count: 1,
        order: [OPENING_ORDER.indexOf(o.type), WALL_ORDER.indexOf(o.wallId), -o.width * o.height],
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2])
    .map(({ type, wall, size, count }) => ({ type, wall, size, count }));
}

/**
 * The placed openings, as the drawings take them. Openings saved before metric coordinates (normalised posX/posY,
 * v0) are left out of the drawings: they are still listed in the table.
 */
export function drawingOpenings(list: ConfigurationData['openingsList']): DrawingOpening[] {
  return list.flatMap((o) =>
    'offsetX' in o && typeof o.offsetX === 'number'
      ? [{ id: o.id, type: o.type, wallId: o.wallId, offsetX: o.offsetX, sill: o.sill, width: o.width, height: o.height }]
      : [],
  );
}

/** The side elevation of the quote: the side wall with the most openings, the left one on a tie. */
export function quoteSideView(openings: readonly DrawingOpening[]): 'left' | 'right' {
  const count = (wallId: DrawingOpening['wallId']) => openings.filter((o) => o.wallId === wallId).length;
  return count('PereteDR') > count('PereteSTG') ? 'right' : 'left';
}

const originOf = (link: string) => {
  try {
    return new URL(link).origin;
  } catch {
    return '';
  }
};

export function buildQuoteModel(input: QuoteInput): QuoteModel {
  const { data, branding, settings, token } = input;
  const { length, width, height } = data.dimensions;
  const layout = computeHallLayout({
    ...clampHallDimensions({ length, width, height }),
    foundation: data.foundation,
    panels: data.sandwichPanels,
    insulationMm: data.insulation,
    roofType: data.roofType ?? 'gable',
    highSide: data.highSide ?? 'right',
  });

  const specification: QuoteRow[] = [
    ...(data.model ? [{ label: 'Model de pornire', value: data.model.name }] : []),
    {
      label: 'Dimensiuni (L × l × H)',
      value: `${formatNumberRo(length)} × ${formatNumberRo(width)} × ${formatNumberRo(height)} m`,
    },
    { label: 'Acoperiș', value: roofText(data) },
    { label: 'Suprafață la sol', value: `${formatNumberRo(length * width)} m²` },
    { label: 'Număr de travee', value: String(layout.bayCount) },
    { label: 'Închideri', value: claddingText(data) },
    { label: 'Fundație', value: data.foundation ? 'Da, placă de beton' : 'Nu' },
  ];

  const chosen = { ...defaultColors(), ...data.colors };
  const colors = COLOR_COMPONENTS.map((c) => ({ label: COMPONENT_LABELS[c], value: chosen[c].name, hex: chosen[c].hex }));

  const images = input.renderViews.map((view) => ({ view, label: RENDER_VIEW_LABELS[view] }));
  const heroIndex = Math.max(0, images.findIndex((i) => i.view === 'front'));

  const placed = drawingOpenings(data.openingsList);
  const drawings = (['front', quoteSideView(placed), 'plan', 'section'] as const).map((view) => buildDrawing(layout, view, placed));

  const amount = data.estimatedPrice ?? 0;
  const vatPercent = formatNumberRo(settings.vatRate * 100);
  return {
    company: { name: branding.name, logoPath: branding.logoPath, contact: contactLines(branding), colors: branding.colors },
    title: 'Ofertă estimativă',
    offerNumber: offerNumber(token),
    date: formatDateRo(input.date),
    images: { hero: images[heroIndex] ?? null, others: images.filter((_, i) => i !== heroIndex) },
    specification,
    colors,
    openings: openingRows(data.openingsList),
    price: {
      label: settings.pricesIncludeVat ? 'Preț estimativ (TVA inclus)' : 'Preț estimativ (fără TVA)',
      amount,
      formatted: formatEuro(amount),
      vatNote: settings.pricesIncludeVat ? `Prețul include TVA ${vatPercent}%.` : `TVA ${vatPercent}% se adaugă.`,
    },
    disclaimer: [
      'Acesta este un preț estimativ, calculat automat din configurația aleasă. Nu este o ofertă fermă și nici un proiect tehnic.',
      'Prețul final se stabilește după vizita în teren și proiectarea halei (verificarea structurii, a terenului și a încărcărilor de zăpadă și vânt).',
      'Imaginile sunt randări ale configurației și au rol de prezentare.',
      ...(images.length > 0 ? [renderCreditLine(originOf(input.link))] : []),
    ],
    link: input.link,
    filename: quoteFilename(token),
    drawings,
  };
}
