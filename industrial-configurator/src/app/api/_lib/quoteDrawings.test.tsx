import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANDING } from '@/lib/branding';
import { DEFAULT_PALETTE } from '@/lib/colors';
import { DEFAULT_PRICES } from '@/lib/pricing';
import { fitDrawing } from '@/lib/hall/drawingsLayout';
import { buildQuoteModel } from '@/lib/quote/quoteModel';
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/quote/settings';
import { configurationDataSchema } from '@/lib/validation/configuration';
import { withServerPrice } from './serverPrice';
import { renderQuotePdf, type QuoteAssets } from './quotePdf';
import { DRAWINGS_PER_PAGE, scaleNote } from './quoteDrawings';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const assets: QuoteAssets = { renders: {}, logo: null, qr: PNG };

const model = (roofType: 'gable' | 'mono') =>
  buildQuoteModel({
    token: 'AbCdEf123456',
    data: withServerPrice(
      configurationDataSchema.parse({
        dimensions: { length: 36, width: 15, height: 5 },
        roofType,
        highSide: 'left',
        foundation: true,
        sandwichPanels: true,
        insulation: 100,
        openingsList: [
          { id: 'g', type: 'garageDoor', wallId: 'PereteFata', offsetX: 5, sill: 0, width: 4, height: 4 },
          { id: 'w1', type: 'window', wallId: 'PereteSTG', offsetX: 2, sill: 1.2, width: 2, height: 1.2 },
          { id: 'w2', type: 'window', wallId: 'PereteSTG', offsetX: 9, sill: 1.2, width: 2, height: 1.2 },
          { id: 'd', type: 'door', wallId: 'PereteDR', offsetX: 3, sill: 0, width: 1, height: 2.1 },
          // Saved before metric coordinates: listed in the table, not drawn.
          { id: 'old', type: 'window', wallId: 'PereteSpate', posX: 0.5, posY: 0.5, width: 1, height: 1 },
        ],
      }),
      DEFAULT_PRICES,
      DEFAULT_PALETTE,
    ),
    date: new Date('2026-11-19T10:00:00Z'),
    link: 'https://example.com/configuration/AbCdEf123456',
    renderViews: [],
    branding: DEFAULT_BRANDING,
    settings: DEFAULT_QUOTE_SETTINGS,
  });

/** Pages of a PDF written by react-pdf (page dictionaries are not compressed). */
const pageCount = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;

describe('quote drawing pages', () => {
  it.each(['gable', 'mono'] as const)('%s: renders the drawings on extra pages', async (roofType) => {
    const m = model(roofType);
    expect(m.drawings.map((d) => d.view)).toEqual(['front', 'left', 'plan', 'section']);
    const withDrawings = await renderQuotePdf(m, assets);
    const without = await renderQuotePdf({ ...m, drawings: [] }, assets);
    expect(withDrawings.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(withDrawings) - pageCount(without)).toBe(Math.ceil(m.drawings.length / DRAWINGS_PER_PAGE));
  }, 30_000);
});

describe('fitDrawing / scaleNote', () => {
  it('scales a drawing to the box and names the paper scale', () => {
    // A 40 m × 10 m elevation in a 515 × 262 pt box: the width limits, 12.875 pt per metre.
    const fit = fitDrawing({ min: [0, 0], max: [40, 10] }, { width: 515, height: 262 });
    expect(fit.scale).toBeCloseTo(12.875, 6);
    // 12.875 pt = 4.54 mm per metre: about 1:220, written 1:200.
    expect(scaleNote(fit)).toBe('Scara aprox. 1:200');
  });
});
