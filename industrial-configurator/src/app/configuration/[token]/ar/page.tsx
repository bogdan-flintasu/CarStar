'use client';

/**
 * AR page of a saved configuration (docs/plans/ar.md): the hall in model-viewer, with a button that opens it in the
 * phone's own AR viewer (iOS AR Quick Look with the USDZ, Android Scene Viewer / WebXR with the GLB). Two modes:
 * "Machetă" (the user scales it down onto a table) and "Mărime reală" (locked at 1:1, to walk around on the plot).
 * On a desktop, a QR code opens this page on a phone. model-viewer is loaded only here.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { configurationDataSchema, type ConfigurationData } from '@/lib/validation/configuration';
import { isArCapableDevice } from '@/components/configurator/hallAr';

interface ArConfiguration {
  data: ConfigurationData;
  ar: { glb: string; usdz: string } | null;
  poster: string | null;
}

interface PublicBrand {
  name: string;
  logoUrl: string | null;
  accent: string;
  accentText: string;
  phone?: string;
  email?: string;
}

type Mode = 'model' | 'full';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'model', label: 'Machetă', hint: 'Așezați hala pe o masă și micșorați-o cu două degete.' },
  { id: 'full', label: 'Mărime reală', hint: 'Hala apare la scara 1:1: ieșiți pe teren și mergeți în jurul ei.' },
];

const FALLBACK_BRAND: PublicBrand = { name: '', logoUrl: null, accent: '#F5A623', accentText: '#111111' };

const roofText = (d: ConfigurationData) =>
  d.roofType === 'mono' ? `O apă (înalt ${d.highSide === 'left' ? 'stânga' : 'dreapta'})` : '2 ape';

/** "Cere oferta": the company's email (with the configuration link), else its phone, else the configuration page. */
function quoteRequestHref(brand: PublicBrand, token: string): string {
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/configuration/${token}`;
  if (brand.email) {
    const subject = encodeURIComponent(`Cerere ofertă hală (${token})`);
    const body = encodeURIComponent(`Bună ziua,\n\nDoresc o ofertă pentru hala configurată aici:\n${link}\n`);
    return `mailto:${brand.email}?subject=${subject}&body=${body}`;
  }
  if (brand.phone) return `tel:${brand.phone.replace(/[^\d+]/g, '')}`;
  return `/configuration/${token}`;
}

export default function ArPage() {
  const token = useParams().token as string;
  const [config, setConfig] = useState<ArConfiguration | null>(null);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState<PublicBrand>(FALLBACK_BRAND);
  const [mode, setMode] = useState<Mode>('model');
  const [viewerReady, setViewerReady] = useState(false);
  const [onPhone, setOnPhone] = useState<boolean | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    setOnPhone(isArCapableDevice());
    fetch('/api/brand')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((b: PublicBrand) => setBrand(b))
      .catch((err) => console.error('Failed to load the brand:', err));
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/configurations/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Configuration not found'))))
      .then((saved) => {
        const parsed = configurationDataSchema.safeParse(saved.data);
        if (!parsed.success) throw new Error('Invalid configuration data');
        const front = (saved.renders ?? []).find((r: { view: string }) => r.view === 'front');
        setConfig({ data: parsed.data, ar: saved.ar ?? null, poster: front?.url ?? null });
      })
      .catch((err) => {
        console.error('Failed to load configuration:', err);
        setError('Configurarea nu a fost găsită.');
      });
  }, [token]);

  // Count the opening (metrics) and load the viewer, only when there is something to show.
  const hasAr = !!config?.ar;
  useEffect(() => {
    if (!hasAr) return;
    fetch(`/api/configurations/${token}/ar/view`, { method: 'POST' }).catch(() => undefined);
    import('@google/model-viewer')
      .then(() => setViewerReady(true))
      .catch((err) => {
        console.error('Failed to load the 3D viewer:', err);
        setError('Vizualizatorul 3D nu a putut fi încărcat.');
      });
  }, [hasAr, token]);

  // Desktop: a QR code of this page, to open it on a phone.
  useEffect(() => {
    if (onPhone !== false || !hasAr) return;
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(window.location.href, { errorCorrectionLevel: 'M', margin: 1, width: 360 }))
      .then(setQr)
      .catch((err) => console.error('Failed to draw the QR code:', err));
  }, [onPhone, hasAr]);

  const accentVars = { '--brand-accent': brand.accent, '--brand-accent-text': brand.accentText } as CSSProperties;
  const background = { background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' };

  if (error || (config && !config.ar)) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 text-white" style={{ ...background, ...accentVars }}>
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold mb-2">AR indisponibil</h1>
          <p className="text-gray-400 text-sm mb-6">
            {error || 'Pentru această configurație nu există încă un model AR. Deschideți configurația și apăsați „Vezi în AR”.'}
          </p>
          <Link
            href={config ? `/configuration/${token}` : '/'}
            className="inline-flex items-center px-6 py-3 rounded-xl bg-[var(--brand-accent)] text-[var(--brand-accent-text)] font-bold text-sm hover:brightness-90 transition"
          >
            {config ? 'Înapoi la configurație' : 'Pagina principală'}
          </Link>
        </div>
      </main>
    );
  }

  if (!config?.ar) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ ...background, ...accentVars }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-gray-800 border-t-[var(--brand-accent)] animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm font-medium">Se încarcă modelul…</p>
        </div>
      </main>
    );
  }

  const d = config.data;
  const active = MODES.find((m) => m.id === mode)!;
  const facts: [string, string][] = [
    ['Dimensiuni', `${d.dimensions.length} × ${d.dimensions.width} × ${d.dimensions.height} m`],
    ['Suprafață', `${d.dimensions.length * d.dimensions.width} m²`],
    ['Acoperiș', roofText(d)],
  ];
  // Quick Look reads its options from the USDZ link's fragment: no scaling at full size.
  const iosSrc = mode === 'full' ? `${config.ar.usdz}#allowsContentScaling=0` : config.ar.usdz;

  return (
    <main className="min-h-screen text-white" style={{ ...background, ...accentVars }}>
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-10">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/configuration/${token}`} className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Configurația
          </Link>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the logo is a user upload served by our own route
            <img src={brand.logoUrl} alt={brand.name} className="h-9 w-auto max-w-[180px] object-contain rounded-md bg-white p-1" />
          ) : (
            <span className="text-lg font-extrabold tracking-tight">{brand.name}</span>
          )}
        </div>

        <h1 className="mt-5 text-2xl md:text-3xl font-bold">Hala ta în AR</h1>

        <div role="radiogroup" aria-label="Mod AR" className="mt-4 inline-flex rounded-xl bg-white/5 border border-white/10 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                mode === m.id ? 'bg-[var(--brand-accent)] text-[var(--brand-accent-text)]' : 'text-gray-300 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-400">{active.hint}</p>

        <div className="mt-4 relative w-full h-[58vh] min-h-[320px] rounded-2xl overflow-hidden bg-[#d9dde3]">
          {viewerReady ? (
            <model-viewer
              key={mode}
              src={config.ar.glb}
              ios-src={iosSrc}
              poster={config.poster ?? undefined}
              alt={`Hala ${d.dimensions.length} × ${d.dimensions.width} m`}
              ar
              ar-modes="webxr scene-viewer quick-look"
              ar-scale={mode === 'full' ? 'fixed' : 'auto'}
              ar-placement="floor"
              camera-controls
              auto-rotate={mode === 'model' ? true : undefined}
              touch-action="pan-y"
              shadow-intensity="1"
              environment-image="neutral"
              exposure="1"
              style={{ width: '100%', height: '100%' }}
            >
              <button
                slot="ar-button"
                type="button"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-[var(--brand-accent)] text-[var(--brand-accent-text)] font-bold text-sm shadow-lg cursor-pointer"
              >
                {mode === 'full' ? 'Pune hala pe teren' : 'Pune macheta pe masă'}
              </button>
            </model-viewer>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-gray-400 border-t-[var(--brand-accent)] animate-spin" />
            </div>
          )}
        </div>

        {onPhone === false && (
          <div className="mt-4 flex items-center gap-4 rounded-xl bg-white/5 border border-white/10 p-4">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL
              <img src={qr} alt="Cod QR pentru această pagină" width={112} height={112} className="rounded-md bg-white shrink-0" />
            )}
            <p className="text-sm text-gray-300">
              AR funcționează pe telefon sau tabletă. Scanează codul cu camera telefonului pentru a deschide această pagină
              acolo. Aici poți roti și mări hala în 3D.
            </p>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-3">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</dt>
              <dd className="mt-0.5 text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        <a
          href={quoteRequestHref(brand, token)}
          className="mt-5 flex justify-center items-center px-6 py-3 rounded-xl bg-[var(--brand-accent)] text-[var(--brand-accent-text)] font-bold text-sm hover:brightness-90 transition"
        >
          Cere oferta
        </a>
        <p className="mt-3 text-xs text-gray-500">
          Modelul AR arată structura, culorile și golurile configurate; detaliile mici (șuruburi, eclise) sunt omise.
        </p>
      </div>
    </main>
  );
}
