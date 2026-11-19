import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANDING, getBranding } from '@/lib/branding';
import { DEFAULT_PALETTE } from '@/lib/colors';
import { DEFAULT_PRICES } from '@/lib/pricing';
import { withServerPrice } from '@/app/api/_lib/serverPrice';
import { configurationDataSchema, type ConfigurationData } from '@/lib/validation/configuration';
import {
  buildQuoteModel,
  drawingOpenings,
  formatDateRo,
  formatEuro,
  formatNumberRo,
  openingRows,
  quoteSideView,
  type QuoteInput,
} from './quoteModel';
import { DEFAULT_QUOTE_SETTINGS, getQuoteSettings } from './settings';

const data = (overrides: Partial<ConfigurationData> = {}): ConfigurationData =>
  withServerPrice(
    configurationDataSchema.parse({
      dimensions: { length: 30, width: 15, height: 5 },
      roofType: 'mono',
      highSide: 'left',
      foundation: true,
      sandwichPanels: true,
      insulation: 100,
      openingsList: [
        { id: 'a', type: 'window', wallId: 'PereteSTG', offsetX: 1, sill: 1, width: 1.2, height: 1 },
        { id: 'b', type: 'window', wallId: 'PereteSTG', offsetX: 4, sill: 1, width: 1.2, height: 1 },
        { id: 'c', type: 'garageDoor', wallId: 'PereteFata', offsetX: 5, sill: 0, width: 4, height: 4 },
        { id: 'd', type: 'door', wallId: 'PereteDR', offsetX: 2, sill: 0, width: 1, height: 2.1 },
      ],
      colors: { walls: { id: 'walls-ral7016', name: 'x', hex: '#000000' } },
      estimatedPrice: 1, // tampered: withServerPrice replaces it
      ...overrides,
    }),
    DEFAULT_PRICES,
    DEFAULT_PALETTE,
  );

const input = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  token: 'AbCdEf123456',
  data: data(),
  date: new Date('2026-11-17T10:00:00Z'),
  link: 'https://example.com/configuration/AbCdEf123456',
  renderViews: ['front', 'rear', 'side', 'aerial'],
  branding: DEFAULT_BRANDING,
  settings: DEFAULT_QUOTE_SETTINGS,
  ...overrides,
});

describe('formatting', () => {
  it('uses Romanian number, money and date formats', () => {
    expect(formatNumberRo(1234567.5)).toBe('1.234.567,5');
    expect(formatNumberRo(12)).toBe('12');
    expect(formatNumberRo(1200)).toBe('1.200');
    expect(formatNumberRo(0)).toBe('0');
    expect(formatNumberRo(13.25)).toBe('13,25');
    expect(formatEuro(43200.4)).toBe('43.200 €');
    expect(formatDateRo(new Date('2026-11-17T23:30:00Z'))).toBe('18.11.2026'); // already the 18th in Bucharest
  });
});

describe('buildQuoteModel', () => {
  it('takes the server price and lists the specification', () => {
    const model = buildQuoteModel(input());
    expect(model.price.amount).toBe(data().estimatedPrice);
    expect(model.price.amount).toBeGreaterThan(1);
    expect(model.price.formatted).toBe(formatEuro(model.price.amount));
    const spec = Object.fromEntries(model.specification.map((r) => [r.label, r.value]));
    expect(spec).toMatchObject({
      'Dimensiuni (L × l × H)': '30 × 15 × 5 m',
      Acoperiș: 'Într-o apă, latura înaltă în stânga',
      'Suprafață la sol': '450 m²',
      'Număr de travee': '5',
      Închideri: 'Panouri sandwich, izolație 100 mm',
      Fundație: 'Da, placă de beton',
    });
    expect(spec['Model de pornire']).toBeUndefined();
  });

  it('names the starting model and a gable roof', () => {
    const model = buildQuoteModel(input({ data: data({ roofType: 'gable', model: { id: 'm1', name: 'Depozit 15 × 30' } }) }));
    expect(model.specification[0]).toEqual({ label: 'Model de pornire', value: 'Depozit 15 × 30' });
    expect(model.specification.find((r) => r.label === 'Acoperiș')?.value).toBe('În două ape');
  });

  it('lists the catalogue colour of every component (names from the catalogue, not the client)', () => {
    const { colors } = buildQuoteModel(input());
    expect(colors).toHaveLength(6);
    expect(colors[0]).toEqual({ label: 'Pereți', value: 'Antracit', hex: '#383e42' });
  });

  it('marks the price as an estimate with the configured VAT handling', () => {
    expect(buildQuoteModel(input()).price).toMatchObject({ label: 'Preț estimativ (fără TVA)', vatNote: 'TVA 21% se adaugă.' });
    const gross = buildQuoteModel(input({ settings: { vatRate: 0.19, pricesIncludeVat: true } })).price;
    expect(gross).toMatchObject({ label: 'Preț estimativ (TVA inclus)', vatNote: 'Prețul include TVA 19%.' });
    expect(buildQuoteModel(input()).disclaimer.join(' ')).toMatch(/nu este o ofertă fermă/i);
    // CC BY 4.0: the props' authors are credited whenever there are pictures.
    expect(buildQuoteModel(input()).disclaimer.join(' ')).toContain('https://example.com/credite');
    expect(buildQuoteModel(input({ renderViews: [] })).disclaimer.join(' ')).not.toContain('/credite');
  });

  it('puts the front view first and the others after it', () => {
    const model = buildQuoteModel(input({ renderViews: ['rear', 'front', 'aerial'] }));
    expect(model.images.hero?.view).toBe('front');
    expect(model.images.others.map((i) => i.view)).toEqual(['rear', 'aerial']);
    expect(buildQuoteModel(input({ renderViews: [] })).images).toEqual({ hero: null, others: [] });
    expect(buildQuoteModel(input({ renderViews: ['side'] })).images.hero?.view).toBe('side');
  });

  it('numbers the offer and names the file from the token', () => {
    const model = buildQuoteModel(input());
    expect(model.offerNumber).toBe('OF-AbCdEf123456');
    expect(model.filename).toBe('oferta-hala-AbCdEf123456.pdf');
    expect(model.date).toBe('17.11.2026');
    expect(model.title).toBe('Ofertă estimativă');
  });

  it('shows the branding, never a hardcoded company', () => {
    const branding = getBranding({ BRAND_NAME: 'Hale Test SRL', BRAND_PHONE: '+40 700 000 000', BRAND_EMAIL: 'a@b.ro' });
    const model = buildQuoteModel(input({ branding }));
    expect(model.company.name).toBe('Hale Test SRL');
    expect(model.company.contact).toEqual(['+40 700 000 000', 'a@b.ro']);
  });
});

describe('openingRows', () => {
  it('groups openings by type, wall and size, doors first', () => {
    expect(openingRows(data().openingsList)).toEqual([
      { type: 'Ușă industrială', wall: 'Față', size: '4 × 4 m', count: 1 },
      { type: 'Ușă', wall: 'Dreapta', size: '1 × 2,1 m', count: 1 },
      { type: 'Fereastră', wall: 'Stânga', size: '1,2 × 1 m', count: 2 },
    ]);
    expect(openingRows([])).toEqual([]);
  });
});

describe('getBranding', () => {
  it('falls back to neutral defaults and rejects unsafe values', () => {
    expect(getBranding({})).toEqual(DEFAULT_BRANDING);
    const b = getBranding({ BRAND_LOGO: '../../etc/passwd.png', BRAND_PRIMARY_COLOR: 'red', BRAND_NAME: 'A\r\nBcc: x' });
    expect(b.logoPath).toBeNull();
    expect(b.colors.primary).toBe(DEFAULT_BRANDING.colors.primary);
    expect(b.name).toBe('A Bcc: x');
    expect(getBranding({ BRAND_LOGO: '/brand/logo.png' }).logoPath).toBe('brand/logo.png');
    expect(getBranding({ BRAND_LOGO: 'https://x.y/logo.png' }).logoPath).toBeNull();
    expect(getBranding({ BRAND_LOGO: 'brand/logo.svg' }).logoPath).toBeNull();
  });
});

describe('getQuoteSettings', () => {
  it('reads the VAT rate and whether prices include it', () => {
    expect(getQuoteSettings({})).toEqual({ vatRate: 0.21, pricesIncludeVat: false });
    expect(getQuoteSettings({ QUOTE_VAT_RATE: '19', QUOTE_PRICES_INCLUDE_VAT: 'true' })).toEqual({ vatRate: 0.19, pricesIncludeVat: true });
    expect(getQuoteSettings({ QUOTE_VAT_RATE: 'abc' }).vatRate).toBe(0.21);
    expect(getQuoteSettings({ QUOTE_VAT_RATE: '0' }).vatRate).toBe(0);
    expect(getQuoteSettings({ QUOTE_VAT_RATE: '150' }).vatRate).toBe(0.21);
  });
});

describe('drawings', () => {
  it('draws the front, the side with the most openings, the plan and the section, with the placed openings', () => {
    const model = buildQuoteModel(input());
    expect(model.drawings.map((d) => d.view)).toEqual(['front', 'left', 'plan', 'section']);
    const refs = (view: string) => model.drawings.find((d) => d.view === view)!.polylines.map((p) => p.ref);
    expect(refs('front')).toContain('opening:c');
    expect(refs('left')).toEqual(expect.arrayContaining(['opening:a', 'opening:b']));
    expect(refs('plan')).toEqual(expect.arrayContaining(['opening:a', 'opening:b', 'opening:c', 'opening:d']));
  });

  it('leaves legacy (normalised) openings out of the drawings only', () => {
    const legacy = data({
      openingsList: [
        { id: 'old', type: 'door', wallId: 'PereteDR', posX: 0.5, posY: 0, width: 1, height: 2 },
        { id: 'new', type: 'door', wallId: 'PereteDR', offsetX: 2, sill: 0, width: 1, height: 2 },
      ] as ConfigurationData['openingsList'],
    });
    expect(drawingOpenings(legacy.openingsList).map((o) => o.id)).toEqual(['new']);
    expect(quoteSideView(drawingOpenings(legacy.openingsList))).toBe('right');
    const model = buildQuoteModel(input({ data: legacy }));
    expect(model.openings).toHaveLength(1);
    expect(model.openings[0].count).toBe(2);
    expect(model.drawings[1].view).toBe('right');
  });
});
