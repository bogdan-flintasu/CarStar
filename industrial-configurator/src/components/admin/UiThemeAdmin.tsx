'use client';

/**
 * Admin editor of the configurator's interface theme: accent, panels, text, page, price bar and 3D background colours,
 * sky on/off and corner rounding, with ready-made presets, contrast checks and a live preview drawn with the same
 * theme mechanism as the configurator. Saved as a whole (PUT /api/admin/theme).
 */
import { useEffect, useState } from 'react';
import {
  DEFAULT_UI_THEME,
  UI_RADII,
  UI_RADIUS_LABELS,
  UI_THEME_COLOR_FIELDS,
  UI_THEME_CONTRAST_PAIRS,
  UI_THEME_LABELS,
  UI_THEME_PRESETS,
  contrastRatio,
  normalizeUiTheme,
  readableTextOn,
  type UiTheme,
  type UiThemeColorField,
} from '@/lib/uiTheme';
import { HEX_PATTERN } from '@/lib/colors';
import UiThemeScope from '@/components/configurator/UiThemeScope';

type AdminFetch = (input: string, init?: RequestInit) => Promise<Response>;

const HINTS: Record<UiThemeColorField, string> = {
  accent: 'Butoane, pasul activ, slidere, selecții.',
  accentText: 'Textul de pe butoanele colorate.',
  surface: 'Panoul de configurare, antetul, cardurile.',
  text: 'Textul principal; nuanțele de gri se calculează între text și panouri.',
  background: 'În spatele panourilor.',
  barBackground: 'Bara de jos cu prețul estimativ.',
  barText: 'Prețul și rezumatul din bară.',
  viewport: 'În spatele halei, când cerul este oprit (și în vederile ortogonale).',
};

function ColorField({ field, value, onChange }: { field: UiThemeColorField; value: string; onChange: (v: string) => void }) {
  /** What is being typed in the hex box; null shows the current value. */
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer"
        aria-label={UI_THEME_LABELS[field]}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white">{UI_THEME_LABELS[field]}</span>
        <span className="block text-[11px] text-gray-500 leading-snug">{HINTS[field]}</span>
      </span>
      <input
        type="text"
        value={draft ?? value}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.trim();
          setDraft(v);
          if (HEX_PATTERN.test(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => setDraft(null)}
        className="w-24 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono outline-none focus:border-[#F5A623]/50"
      />
    </label>
  );
}

/** A small configurator drawn with the theme, using the same classes as the real components. */
function ThemePreview({ theme }: { theme: UiTheme }) {
  return (
    <UiThemeScope theme={theme} className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div className="bg-[var(--color-bg-primary)] text-[13px] select-none" aria-hidden>
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
          <span className="font-extrabold tracking-tight">
            <span className="text-gray-900">Firma</span>
            <span className="text-[var(--color-primary)]">Ta</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-offset-1 ring-[var(--color-primary)]">1</span>
            <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center">2</span>
            <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center">3</span>
          </div>
        </div>
        <div className="flex h-[230px]">
          <div
            className="flex-1 relative"
            style={{
              background: theme.sky
                ? `linear-gradient(180deg, #8fb8e8 0%, #cfe2f5 55%, ${theme.viewport} 56%, ${theme.viewport} 100%)`
                : theme.viewport,
            }}
          >
            <svg viewBox="0 0 200 120" className="absolute inset-x-6 bottom-6 top-10 m-auto w-[70%] h-auto">
              <polygon points="30,95 30,55 100,30 170,55 170,95" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1.5" />
              <rect x="88" y="65" width="24" height="30" fill="#6b7280" />
            </svg>
            <div className="absolute top-2 right-2 bg-white/90 border border-gray-200 rounded-xl p-1 flex flex-col gap-0.5 text-[10px] font-bold">
              <span className="px-2 py-0.5 rounded-md bg-[var(--color-primary)] text-[var(--ui-accent-text)]">3D</span>
              <span className="px-2 py-0.5 rounded-md text-gray-700">Față</span>
              <span className="px-2 py-0.5 rounded-md text-gray-700">Plan</span>
            </div>
          </div>
          <div className="w-[46%] bg-white border-l border-gray-200 p-3 flex flex-col gap-2.5">
            <span className="text-[10px] font-bold tracking-widest uppercase text-black">Personalizează hala</span>
            <div>
              <div className="flex justify-between text-[11px] text-gray-600 font-semibold">
                <span>Lungime</span>
                <span className="text-black">30 m</span>
              </div>
              <div className="h-1 mt-2 rounded-full bg-gray-200">
                <div className="h-1 w-3/5 rounded-full bg-[var(--color-primary)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <span className="rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 px-2 py-1.5 text-[11px] font-bold text-black">
                Două ape
              </span>
              <span className="rounded-xl border border-gray-300 px-2 py-1.5 text-[11px] font-semibold text-gray-500">O apă</span>
            </div>
            <span className="mt-auto rounded-xl bg-[var(--color-primary)] text-[var(--ui-accent-text)] text-center py-2 font-bold text-xs">
              Trimite cererea
            </span>
          </div>
        </div>
        <div className="cfg-bar bg-black text-white flex items-center justify-between border-t-4 border-[var(--color-primary)]">
          <div className="px-4 py-2">
            <span className="block text-[10px] text-gray-400">Preț estimativ:</span>
            <span className="text-lg font-serif">€48,500</span>
          </div>
          <span className="self-stretch flex items-center px-5 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] text-[var(--ui-accent-text)] font-bold text-xs">
            CONTINUĂ ›
          </span>
        </div>
      </div>
    </UiThemeScope>
  );
}

export default function UiThemeAdmin({ adminFetch }: { adminFetch: AdminFetch }) {
  const [theme, setTheme] = useState<UiTheme | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/theme')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setTheme(normalizeUiTheme(data)))
      .catch((err) => {
        console.error('Failed to load the UI theme:', err);
        setTheme({ ...DEFAULT_UI_THEME });
        setError('Tema salvată nu a putut fi citită; se afișează tema implicită.');
      });
  }, [adminFetch]);

  if (!theme) return <div className="text-sm text-gray-500">Se încarcă...</div>;

  const patch = (p: Partial<UiTheme>) => setTheme({ ...theme, ...p });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
      });
      if (!res.ok) {
        setError(res.status === 400 ? 'Valori invalide: fiecare culoare trebuie să fie de forma #rrggbb.' : 'Salvarea a eșuat. Încearcă din nou.');
        return;
      }
      setTheme(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save the UI theme:', err);
      setError('Salvarea a eșuat. Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  const activePreset = UI_THEME_PRESETS.find((p) => JSON.stringify(p.theme) === JSON.stringify(theme))?.id;

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Interfața configuratorului</h2>
          <p className="text-xs text-gray-500 mt-1">
            Culorile și forma interfeței văzute de clienți. Se aplică la următoarea deschidere a configuratorului.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/configurator"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:text-white font-medium"
          >
            Deschide configuratorul ↗
          </a>
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-[#F5A623]/20"
          >
            {saving ? 'Se salvează...' : saved ? '✓ Salvat' : 'Salvează'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="mb-6">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Teme predefinite</span>
        <div className="flex flex-wrap gap-2">
          {UI_THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setTheme({ ...preset.theme })}
              className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                activePreset === preset.id ? 'border-[#F5A623] text-white bg-[#F5A623]/10' : 'border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              <span className="flex -space-x-1">
                {[preset.theme.accent, preset.theme.surface, preset.theme.barBackground].map((c, i) => (
                  <span key={i} className="w-3.5 h-3.5 rounded-full border border-black/30" style={{ background: c }} />
                ))}
              </span>
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_minmax(0,440px)] gap-8 items-start">
        <div>
          {UI_THEME_COLOR_FIELDS.map((field) => (
            <ColorField key={field} field={field} value={theme[field]} onChange={(v) => patch({ [field]: v })} />
          ))}

          <div className="flex flex-wrap items-center gap-6 pt-4">
            <label className="flex items-center gap-2 text-sm text-white font-semibold cursor-pointer">
              <input type="checkbox" checked={theme.sky} onChange={(e) => patch({ sky: e.target.checked })} className="accent-[#F5A623] w-4 h-4" />
              Cer în vizualizarea 3D
            </label>
            <label className="flex items-center gap-2 text-sm text-white font-semibold">
              Colțuri
              <select
                value={theme.radius}
                onChange={(e) => patch({ radius: e.target.value as UiTheme['radius'] })}
                className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none"
              >
                {UI_RADII.map((r) => (
                  <option key={r} value={r} className="bg-gray-900">
                    {UI_RADIUS_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setTheme({ ...DEFAULT_UI_THEME })}
              className="text-xs text-gray-500 hover:text-white underline cursor-pointer"
            >
              Revino la tema implicită
            </button>
          </div>
        </div>

        <div className="lg:sticky lg:top-24 space-y-4">
          <ThemePreview theme={theme} />
          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">Lizibilitate (contrast WCAG)</span>
            {UI_THEME_CONTRAST_PAIRS.map(({ label, fg, bg }) => {
              const ratio = contrastRatio(theme[fg], theme[bg]);
              const ok = ratio >= 4.5;
              return (
                <div key={label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-gray-400">{label}</span>
                  <span className="flex items-center gap-2">
                    <span className={`font-mono font-bold ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {ratio.toFixed(1)}:1 {ok ? '✓' : '— greu de citit'}
                    </span>
                    {!ok && (
                      <button
                        type="button"
                        onClick={() => patch({ [fg]: readableTextOn(theme[bg]) })}
                        className="px-2 py-0.5 rounded bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                      >
                        Corectează
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
