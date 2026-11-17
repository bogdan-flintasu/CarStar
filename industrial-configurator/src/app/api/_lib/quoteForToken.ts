/**
 * The PDF quote of a saved configuration, built on the server from the STORED configuration and the CURRENT DB prices
 * (B5: nothing priced by the client). Shared by the download route and the lead email.
 */
import { readFile } from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import prisma from '@/lib/prisma';
import { getBranding } from '@/lib/branding';
import { buildQuoteModel } from '@/lib/quote/quoteModel';
import { getQuoteSettings } from '@/lib/quote/settings';
import { configurationDataSchema } from '@/lib/validation/configuration';
import { buildConfigurationLink } from '@/lib/validation/email';
import { getCurrentPrices, getOrSeedPalette } from './prices';
import { withServerPrice } from './serverPrice';
import { loadRenders } from './renderStore';
import { renderQuotePdf, type QuoteAssets } from './quotePdf';

export interface QuotePdf {
  pdf: Buffer;
  filename: string;
}

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** The branding logo (a PNG/JPEG under public/), or null when there is none or it cannot be read. */
async function readLogo(logoPath: string | null): Promise<QuoteAssets['logo']> {
  if (!logoPath) return null;
  const file = path.resolve(PUBLIC_DIR, logoPath);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null;
  try {
    return { data: await readFile(file), format: /\.png$/i.test(file) ? 'png' : 'jpg' };
  } catch {
    console.warn(`Branding logo not found: public/${logoPath}`);
    return null;
  }
}

/**
 * The quote of configuration `token`, or null when there is no such configuration or its data predates the current
 * schema. `origin` is the public origin the link and QR code point to.
 */
export async function buildQuotePdfForToken(token: string, origin: string, now = new Date()): Promise<QuotePdf | null> {
  const row = await prisma.configuration.findUnique({ where: { token }, select: { id: true, data: true } });
  if (!row) return null;
  const stored = configurationDataSchema.safeParse(row.data);
  if (!stored.success) return null;

  const data = withServerPrice(stored.data, await getCurrentPrices(), await getOrSeedPalette());
  // The starting model is named only while it still exists, under its current name.
  if (data.model) {
    const model = await prisma.hallModel.findUnique({ where: { id: data.model.id }, select: { id: true, name: true } });
    data.model = model ?? undefined;
  }

  const renders = await loadRenders(row.id);
  const branding = getBranding();
  const link = buildConfigurationLink(origin, token);
  const model = buildQuoteModel({
    token,
    data,
    date: now,
    link,
    renderViews: renders.map((r) => r.view),
    branding,
    settings: getQuoteSettings(),
  });
  const assets: QuoteAssets = {
    renders: Object.fromEntries(renders.map((r) => [r.view, r.bytes])),
    logo: await readLogo(branding.logoPath),
    qr: await QRCode.toBuffer(link, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 300 }),
  };
  return { pdf: await renderQuotePdf(model, assets), filename: model.filename };
}
