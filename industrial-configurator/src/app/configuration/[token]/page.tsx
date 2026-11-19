'use client';

/**
 * Public page of a saved configuration (the shared link and the QR code in the PDF quote): its pictures, the main
 * figures, the PDF quote and a button that opens it in the configurator.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { applyHallConfiguration } from '@/lib/applyHallConfiguration';
import { configurationDataSchema, type ConfigurationData } from '@/lib/validation/configuration';
import RenderGallery, { type GalleryImage } from '@/components/configurator/RenderGallery';

interface SavedConfiguration {
  data: ConfigurationData;
  renders: GalleryImage[];
  pdfUrl: string;
}

interface PublicBrand {
  name: string;
  logoUrl: string | null;
  accent: string;
  accentText: string;
}

/** Shown until /api/brand answers (and when it fails): the stock orange, no company name. */
const FALLBACK_BRAND: PublicBrand = { name: '', logoUrl: null, accent: '#F5A623', accentText: '#111111' };

/** The company's logo, or its name when it has none. */
function BrandMark({ brand, className = '' }: { brand: PublicBrand; className?: string }) {
  return brand.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the logo is a user upload served by our own route (SVG or raster)
    <img src={brand.logoUrl} alt={brand.name} className={`h-11 w-auto max-w-[240px] object-contain rounded-lg bg-white p-1.5 ${className}`} />
  ) : (
    <span className={`text-2xl font-extrabold tracking-tight text-white ${className}`}>{brand.name}</span>
  );
}

const roofText = (d: ConfigurationData) =>
  d.roofType === 'mono' ? `O apă (înalt ${d.highSide === 'left' ? 'stânga' : 'dreapta'})` : '2 ape';

export default function ConfigurationTokenPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [config, setConfig] = useState<SavedConfiguration | null>(null);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState<PublicBrand>(FALLBACK_BRAND);

  useEffect(() => {
    fetch('/api/brand')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((b: PublicBrand) => setBrand(b))
      .catch((err) => console.error('Failed to load the brand:', err));
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/configurations/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Configuration not found');
        return res.json();
      })
      .then((saved) => {
        const parsed = configurationDataSchema.safeParse(saved.data);
        if (!parsed.success) throw new Error('Invalid configuration data');
        setConfig({ data: parsed.data, renders: saved.renders ?? [], pdfUrl: saved.pdfUrl });
      })
      .catch((err) => {
        console.error('Failed to load configuration:', err);
        setError('Configurarea nu a fost găsită.');
      });
  }, [token]);

  const openInConfigurator = () => {
    if (!config) return;
    applyHallConfiguration(config.data, config.data.model ?? null);
    router.push('/configurator');
  };

  // The brand's accent drives every highlight on this page (buttons, spinner).
  const accentVars = { '--brand-accent': brand.accent, '--brand-accent-text': brand.accentText } as CSSProperties;
  const background = { background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0f0f0f', ...accentVars }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Eroare</h1>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--brand-accent)] text-[var(--brand-accent-text)] font-bold text-sm hover:brightness-90 transition"
          >
            Înapoi la Pagina Principală
          </Link>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ ...background, ...accentVars }}>
        <div className="text-center">
          <div className="select-none mb-6 flex justify-center">
            <BrandMark brand={brand} />
          </div>
          <div className="w-10 h-10 rounded-full border-2 border-gray-800 border-t-[var(--brand-accent)] animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm font-medium">Se încarcă configurarea…</p>
        </div>
      </div>
    );
  }

  const d = config.data;
  const facts: [string, string][] = [
    ['Dimensiuni', `${d.dimensions.length} × ${d.dimensions.width} × ${d.dimensions.height} m`],
    ['Acoperiș', roofText(d)],
    ['Suprafață', `${d.dimensions.length * d.dimensions.width} m²`],
    ['Panouri sandwich', d.sandwichPanels ? (d.insulation > 0 ? `Da, ${d.insulation} mm` : 'Da') : 'Nu'],
    ['Fundație', d.foundation ? 'Da' : 'Nu'],
    ['Uși și ferestre', String(d.openingsList.length)],
  ];

  return (
    <main className="min-h-screen text-white" style={{ ...background, ...accentVars }}>
      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <Link href="/" className="inline-block select-none">
          <BrandMark brand={brand} />
        </Link>

        <h1 className="mt-6 text-2xl md:text-3xl font-bold">Configurația halei tale</h1>
        {d.model && <p className="mt-1 text-sm text-gray-400">Pornită de la modelul „{d.model.name}”</p>}

        <section className="mt-6" aria-label="Imagini">
          {config.renders.length > 0 ? (
            <RenderGallery images={config.renders} dark />
          ) : (
            <p className="text-sm text-gray-400">Pentru această configurație nu există imagini salvate.</p>
          )}
        </section>

        <dl className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</dt>
              <dd className="mt-0.5 text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <a
            href={config.pdfUrl}
            download={`oferta-hala-${token}.pdf`}
            className="inline-flex justify-center items-center px-6 py-3 rounded-xl bg-[var(--brand-accent)] text-[var(--brand-accent-text)] font-bold text-sm hover:brightness-90 transition"
          >
            Descarcă oferta PDF
          </a>
          <button
            type="button"
            onClick={openInConfigurator}
            className="inline-flex justify-center items-center px-6 py-3 rounded-xl border border-white/20 font-bold text-sm hover:bg-white/10 transition-colors cursor-pointer"
          >
            Deschide în configurator
          </button>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Prețul din ofertă este estimativ și se calculează cu prețurile actuale. Oferta finală se face după vizita în teren și proiectare.
        </p>
      </div>
    </main>
  );
}
