/**
 * Draws a QuoteModel (src/lib/quote/quoteModel.ts) as an A4 PDF with @react-pdf/renderer. Layout only: every text,
 * number and decision comes from the model. Inter (OFL, assets/fonts/inter) is embedded because the built-in PDF
 * fonts have no ș/ț.
 */
import path from 'path';
// `PdfImage`: a PDF image (no alt text in PDF), not next/image.
import { Document, Font, Image as PdfImage, Link, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { RenderView } from '@/lib/hall/renderViews';
import type { QuoteImage, QuoteModel } from '@/lib/quote/quoteModel';
import { QuoteDrawingPages } from './quoteDrawings';

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'inter');
let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(FONT_DIR, 'Inter_400Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'Inter_600SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(FONT_DIR, 'Inter_700Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Romanian words are not hyphenated by the default (English) rules: break lines between words only.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export interface QuoteAssets {
  renders: Partial<Record<RenderView, Uint8Array>>;
  logo: { data: Buffer; format: 'png' | 'jpg' } | null;
  /** PNG of the QR code of the configuration link. */
  qr: Buffer;
}

const PAGE_PADDING = 40;
const CONTENT_WIDTH = 595.28 - 2 * PAGE_PADDING;
const GAP = 8;

function styles(colors: QuoteModel['company']['colors']) {
  return StyleSheet.create({
    page: { fontFamily: 'Inter', fontSize: 9.5, color: colors.text, padding: PAGE_PADDING, paddingBottom: 92 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    company: { fontSize: 15, fontWeight: 700 },
    logo: { height: 34, maxWidth: 200, objectFit: 'contain' },
    contact: { fontSize: 8, color: colors.muted, textAlign: 'right', lineHeight: 1.45 },
    accent: { height: 3, backgroundColor: colors.primary, marginTop: 12, marginBottom: 16 },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
    title: { fontSize: 22, fontWeight: 700 },
    meta: { fontSize: 9, color: colors.muted, textAlign: 'right', lineHeight: 1.45 },
    metaStrong: { color: colors.text, fontWeight: 600 },
    hero: { width: CONTENT_WIDTH, height: CONTENT_WIDTH / 1.6, borderRadius: 3 },
    grid: { flexDirection: 'row', marginTop: GAP, gap: GAP },
    thumb: { borderRadius: 3 },
    caption: { fontSize: 7.5, color: colors.muted, marginTop: 3 },
    section: { marginTop: 18 },
    h2: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, color: colors.text },
    row: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: colors.line, paddingVertical: 5 },
    label: { width: '42%', color: colors.muted },
    value: { width: '58%', fontWeight: 600 },
    swatch: { width: 9, height: 9, borderRadius: 2, borderWidth: 0.5, borderColor: '#9CA3AF', marginRight: 6, marginTop: 1 },
    th: { fontSize: 8, color: colors.muted, fontWeight: 600, textTransform: 'uppercase' },
    priceBox: {
      marginTop: 20,
      borderWidth: 1.2,
      borderColor: colors.primary,
      borderRadius: 4,
      padding: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    priceLabel: { fontSize: 10, fontWeight: 600 },
    priceNote: { fontSize: 8.5, color: colors.muted, marginTop: 3 },
    priceAmount: { fontSize: 22, fontWeight: 700 },
    disclaimer: { marginTop: 14, fontSize: 7.8, color: colors.muted, lineHeight: 1.5 },
    footer: {
      position: 'absolute',
      left: PAGE_PADDING,
      right: PAGE_PADDING,
      bottom: 24,
      borderTopWidth: 0.6,
      borderTopColor: colors.line,
      paddingTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    // No lineHeight here: on a fixed footer with a `render` text it throws the footer off the page (react-pdf 4.9).
    footerText: { flex: 1, fontSize: 7.5, color: colors.muted, gap: 3 },
    footerLink: { color: colors.text, textDecoration: 'none' },
    qr: { width: 48, height: 48, marginLeft: 12 },
  });
}

type Styles = ReturnType<typeof styles>;

function Picture({ image, assets, width, s }: { image: QuoteImage; assets: QuoteAssets; width: number; s: Styles }) {
  const bytes = assets.renders[image.view];
  if (!bytes) return null;
  return (
    <View style={{ width }}>
      <PdfImage src={{ data: Buffer.from(bytes), format: 'jpg' }} style={[s.thumb, { width, height: width / 1.6 }]} />
      <Text style={s.caption}>{image.label}</Text>
    </View>
  );
}

function Rows({ rows, s }: { rows: { label: string; value: string; hex?: string }[]; s: Styles }) {
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={s.row} wrap={false}>
          <Text style={s.label}>{r.label}</Text>
          <View style={[s.value, { flexDirection: 'row' }]}>
            {r.hex && <View style={[s.swatch, { backgroundColor: r.hex }]} />}
            <Text>{r.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function QuoteDocument({ model, assets }: { model: QuoteModel; assets: QuoteAssets }) {
  const s = styles(model.company.colors);
  const { hero, others } = model.images;
  const hasHero = !!hero && !!assets.renders[hero.view];
  const thumbWidth = (CONTENT_WIDTH - GAP * Math.max(0, others.length - 1)) / Math.max(1, others.length);
  const openingCols = ['34%', '22%', '30%', '14%'] as const;

  return (
    <Document title={`${model.title} ${model.offerNumber}`} author={model.company.name} language="ro">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {assets.logo ? (
            <PdfImage src={assets.logo} style={s.logo} />
          ) : (
            <Text style={s.company}>{model.company.name}</Text>
          )}
          <View>
            {assets.logo && <Text style={[s.contact, { color: model.company.colors.text, fontWeight: 600 }]}>{model.company.name}</Text>}
            {model.company.contact.map((line) => (
              <Text key={line} style={s.contact}>
                {line}
              </Text>
            ))}
          </View>
        </View>
        <View style={s.accent} fixed />

        <View style={s.titleRow}>
          <Text style={s.title}>{model.title}</Text>
          <View>
            <Text style={s.meta}>
              Nr. ofertă: <Text style={s.metaStrong}>{model.offerNumber}</Text>
            </Text>
            <Text style={s.meta}>
              Data: <Text style={s.metaStrong}>{model.date}</Text>
            </Text>
          </View>
        </View>

        {hasHero && (
          <>
            <PdfImage src={{ data: Buffer.from(assets.renders[hero!.view]!), format: 'jpg' }} style={s.hero} />
            {others.length > 0 && (
              <View style={s.grid}>
                {others.map((image) => (
                  <Picture key={image.view} image={image} assets={assets} width={thumbWidth} s={s} />
                ))}
              </View>
            )}
          </>
        )}

        <View style={s.section} break={hasHero}>
          <Text style={s.h2}>Specificații</Text>
          <Rows rows={model.specification} s={s} />
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Culori</Text>
          <Rows rows={model.colors} s={s} />
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Uși și ferestre</Text>
          {model.openings.length === 0 ? (
            <Text style={{ color: model.company.colors.muted }}>Fără uși sau ferestre.</Text>
          ) : (
            <View>
              <View style={s.row}>
                {['Tip', 'Perete', 'Dimensiune (l × h)', 'Buc.'].map((h, i) => (
                  <Text key={h} style={[s.th, { width: openingCols[i] }, i === 3 ? { textAlign: 'right' } : {}]}>
                    {h}
                  </Text>
                ))}
              </View>
              {model.openings.map((o) => (
                <View key={`${o.type}${o.wall}${o.size}`} style={s.row} wrap={false}>
                  <Text style={{ width: openingCols[0], fontWeight: 600 }}>{o.type}</Text>
                  <Text style={{ width: openingCols[1] }}>{o.wall}</Text>
                  <Text style={{ width: openingCols[2] }}>{o.size}</Text>
                  <Text style={{ width: openingCols[3], textAlign: 'right', fontWeight: 600 }}>{o.count}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View wrap={false}>
          <View style={s.priceBox}>
            <View>
              <Text style={s.priceLabel}>{model.price.label}</Text>
              <Text style={s.priceNote}>{model.price.vatNote}</Text>
            </View>
            <Text style={s.priceAmount}>{model.price.formatted}</Text>
          </View>
          <View style={s.disclaimer}>
            {model.disclaimer.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
        </View>

        <QuoteDrawingPages model={model} />

        <View style={s.footer} fixed>
          <View style={s.footerText}>
            <Text>
              Configurația online:{' '}
              <Link src={model.link} style={s.footerLink}>
                {model.link}
              </Link>
            </Text>
            <Text render={({ pageNumber, totalPages }) => `${model.offerNumber} · Pagina ${pageNumber} din ${totalPages}`} />
          </View>
          <PdfImage src={{ data: assets.qr, format: 'png' }} style={s.qr} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(model: QuoteModel, assets: QuoteAssets): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<QuoteDocument model={model} assets={assets} />);
}
