/**
 * How prices are presented in a quote. Configurable, not assumed (the owner decides):
 *
 *   QUOTE_VAT_RATE             VAT in percent                                   (default 21)
 *   QUOTE_PRICES_INCLUDE_VAT   "true" when the admin's prices already include VAT (default false: VAT is added)
 */
export interface QuoteSettings {
  /** 0.21 for 21 %. */
  vatRate: number;
  pricesIncludeVat: boolean;
}

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = { vatRate: 0.21, pricesIncludeVat: false };

export function getQuoteSettings(env: Record<string, string | undefined> = process.env): QuoteSettings {
  const percent = Number(env.QUOTE_VAT_RATE);
  const vatRate =
    env.QUOTE_VAT_RATE !== undefined && env.QUOTE_VAT_RATE.trim() !== '' && Number.isFinite(percent) && percent >= 0 && percent <= 100
      ? percent / 100
      : DEFAULT_QUOTE_SETTINGS.vatRate;
  const pricesIncludeVat = /^(1|true|yes|da)$/i.test(env.QUOTE_PRICES_INCLUDE_VAT?.trim() ?? '');
  return { vatRate, pricesIncludeVat };
}
