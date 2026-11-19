'use client';

/**
 * Admin editor of the company's identity: name, contact and legal details, logo upload and the brand colours.
 * After a logo upload it offers "Folosim culorile din logo?": the dominant colours are read in the browser (canvas),
 * shown as swatches with a suggested main and second colour, and the admin accepts, picks their own or keeps the theme.
 */
import { useEffect, useRef, useState } from 'react';
import { HEX_PATTERN } from '@/lib/colors';
import { paletteFromImageUrl, suggestBrandColors, type PaletteColor } from '@/lib/brandColors';
import { MAX_LOGO_BYTES } from '@/lib/validation/brand';

type AdminFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** What `GET /api/admin/brand` returns. */
export interface AdminBrand {
  displayName: string;
  legalName: string;
  taxId: string;
  regNo: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
  secondaryColor: string | null;
  logoUrl: string | null;
  logoMime: string | null;
  effectiveName: string;
}

type Form = Omit<AdminBrand, 'logoUrl' | 'logoMime' | 'effectiveName'>;

const toForm = (b: AdminBrand): Form => ({
  displayName: b.displayName,
  legalName: b.legalName,
  taxId: b.taxId,
  regNo: b.regNo,
  address: b.address,
  phone: b.phone,
  email: b.email,
  website: b.website,
  primaryColor: b.primaryColor,
  secondaryColor: b.secondaryColor,
});

const TEXT_FIELDS: { key: keyof Form; label: string; placeholder?: string; wide?: boolean }[] = [
  { key: 'displayName', label: 'Numele afișat', placeholder: 'ex. Hale Metalice SRL', wide: true },
  { key: 'legalName', label: 'Denumire legală' },
  { key: 'taxId', label: 'CUI' },
  { key: 'regNo', label: 'Nr. Reg. Com.' },
  { key: 'address', label: 'Adresă', wide: true },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Site web' },
];

const inputClass =
  'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-[#F5A623]/50 transition-colors';

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const valid = HEX_PATTERN.test(value);
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300">
      <input
        type="color"
        value={valid ? value : '#888888'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer"
      />
      <span className="w-24">{label}</span>
      <input
        value={draft ?? value}
        placeholder="#rrggbb"
        onChange={(e) => {
          const v = e.target.value.trim();
          setDraft(v);
          if (HEX_PATTERN.test(v) || v === '') onChange(v.toLowerCase());
        }}
        onBlur={() => setDraft(null)}
        className="w-24 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono outline-none focus:border-[#F5A623]/50"
      />
    </label>
  );
}

interface BrandAdminProps {
  adminFetch: AdminFetch;
  brand: AdminBrand | null;
  onBrandChange: (brand: AdminBrand) => void;
  /** The admin accepted these brand colours: the theme editor offers the generated variants. */
  onColorsApplied: (primary: string, secondary: string) => void;
}

export default function BrandAdmin({ adminFetch, brand, onBrandChange, onColorsApplied }: BrandAdminProps) {
  const [form, setForm] = useState<Form | null>(brand ? toForm(brand) : null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  /** The "Folosim culorile din logo?" question: the palette read from the logo just uploaded. */
  const [suggestion, setSuggestion] = useState<{ palette: PaletteColor[]; primary: string; secondary: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The form is filled once, when the brand first arrives (later changes come from this component's own saves).
  const [prevBrand, setPrevBrand] = useState(brand);
  if (brand && !prevBrand) {
    setPrevBrand(brand);
    setForm(toForm(brand));
  }

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  if (!brand || !form) return <div className="text-sm text-gray-500 mb-6">Se încarcă datele firmei...</div>;

  const patch = (p: Partial<Form>) => setForm({ ...form, ...p });

  /** Saves the form (optionally with different colours); returns whether it worked. */
  const save = async (next: Form = form): Promise<boolean> => {
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...next, secondaryColor: next.secondaryColor || '' }),
      });
      if (!res.ok) {
        setError(res.status === 400 ? 'Date invalide: verifică emailul și culorile (#rrggbb).' : 'Salvarea a eșuat. Încearcă din nou.');
        return false;
      }
      const updated = (await res.json()) as AdminBrand;
      onBrandChange(updated);
      setForm(toForm(updated));
      setSaved(true);
      return true;
    } catch (err) {
      console.error('Failed to save the brand:', err);
      setError('Salvarea a eșuat. Încearcă din nou.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setError('');
    setSuggestion(null);
    setChoosing(false);
    if (file.size > MAX_LOGO_BYTES) {
      setError('Logoul poate avea cel mult 1 MB.');
      return;
    }
    setUploading(true);
    try {
      const res = await adminFetch('/api/admin/brand/logo', { method: 'POST', body: file });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Încărcarea a eșuat. Încearcă din nou.');
        return;
      }
      const updated = (await res.json()) as AdminBrand;
      onBrandChange(updated);
      if (updated.logoUrl) {
        try {
          const palette = await paletteFromImageUrl(updated.logoUrl);
          const suggested = suggestBrandColors(palette);
          if (suggested) setSuggestion({ palette, ...suggested });
        } catch (err) {
          console.warn('Could not read the logo colours:', err);
        }
      }
    } catch (err) {
      console.error('Failed to upload the logo:', err);
      setError('Încărcarea a eșuat. Încearcă din nou.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeLogo = async () => {
    setError('');
    setSuggestion(null);
    try {
      const res = await adminFetch('/api/admin/brand/logo', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onBrandChange((await res.json()) as AdminBrand);
    } catch (err) {
      console.error('Failed to remove the logo:', err);
      setError('Logoul nu a putut fi șters.');
    }
  };

  const applyColors = async (primary: string, secondary: string) => {
    if (await save({ ...form, primaryColor: primary, secondaryColor: secondary })) {
      onColorsApplied(primary, secondary);
      setSuggestion(null);
      setChoosing(false);
    }
  };

  return (
    <section className="mb-8 pb-8 border-b border-white/5" aria-label="Identitatea firmei">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Identitatea firmei</h2>
          <p className="text-xs text-gray-500 mt-1">
            Numele, logoul și datele de contact apar în configurator, în oferta PDF, în emailuri și în pictograma paginii.
          </p>
        </div>
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Se salvează...' : saved ? '✓ Salvat' : 'Salvează datele firmei'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-[220px_1fr] gap-6">
        <div>
          <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Logo</span>
          <div className="h-28 rounded-xl bg-white flex items-center justify-center p-3 border border-white/10">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the logo is a user upload served by our own route
              <img src={brand.logoUrl} alt="Logo curent" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-gray-500 text-center">Fără logo: se afișează numele firmei</span>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"
            className="sr-only"
            id="brand-logo-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <label
              htmlFor="brand-logo-file"
              className={`px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {uploading ? 'Se încarcă...' : brand.logoUrl ? 'Schimbă logoul' : 'Încarcă logo'}
            </label>
            {brand.logoUrl && (
              <button type="button" onClick={removeLogo} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white cursor-pointer">
                Șterge
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">PNG, JPG sau SVG, cel mult 1 MB.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {TEXT_FIELDS.map(({ key, label, placeholder, wide }) => (
            <label key={key} className={`block ${wide ? 'sm:col-span-2' : ''}`}>
              <span className="block text-xs text-gray-400 mb-1">{label}</span>
              <input
                value={String(form[key] ?? '')}
                placeholder={placeholder}
                onChange={(e) => patch({ [key]: e.target.value })}
                className={inputClass}
              />
            </label>
          ))}
          <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <ColorInput label="Culoarea firmei" value={form.primaryColor} onChange={(v) => patch({ primaryColor: v })} />
            <ColorInput label="A doua culoare" value={form.secondaryColor ?? ''} onChange={(v) => patch({ secondaryColor: v || null })} />
          </div>
        </div>
      </div>

      {suggestion && (
        <div role="region" aria-label="Culorile din logo" className="mt-6 rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/5 p-4">
          <h3 className="text-sm font-bold text-white">Folosim culorile din logo?</h3>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2" aria-label="Culorile găsite">
              {suggestion.palette.map((c) => (
                <span key={c.hex} className="w-8 h-8 rounded-full border border-white/20" style={{ background: c.hex }} title={c.hex} />
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded border border-white/20" style={{ background: suggestion.primary }} />
                Principală {suggestion.primary}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded border border-white/20" style={{ background: suggestion.secondary }} />
                A doua {suggestion.secondary}
              </span>
            </div>
          </div>
          {choosing ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <ColorInput label="Principală" value={suggestion.primary} onChange={(v) => setSuggestion({ ...suggestion, primary: v })} />
              <ColorInput label="A doua" value={suggestion.secondary} onChange={(v) => setSuggestion({ ...suggestion, secondary: v })} />
              <button
                type="button"
                disabled={!HEX_PATTERN.test(suggestion.primary) || !HEX_PATTERN.test(suggestion.secondary)}
                onClick={() => applyColors(suggestion.primary, suggestion.secondary)}
                className="px-4 py-2 rounded-lg bg-[#F5A623] text-black text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                Aplică
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyColors(suggestion.primary, suggestion.secondary)}
                className="px-4 py-2 rounded-lg bg-[#F5A623] text-black text-sm font-bold cursor-pointer"
              >
                Da, aplică
              </button>
              <button
                type="button"
                onClick={() => setChoosing(true)}
                className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/20 cursor-pointer"
              >
                Aleg eu
              </button>
              <button
                type="button"
                onClick={() => setSuggestion(null)}
                className="px-4 py-2 rounded-lg text-gray-400 text-sm font-semibold hover:text-white cursor-pointer"
              >
                Nu, păstrez tema actuală
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
