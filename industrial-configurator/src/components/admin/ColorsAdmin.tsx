'use client';

/**
 * Admin editor of the colour catalogue: per component, the colours offered to customers, which one is the default
 * and what each costs extra. Saved as a whole (PUT /api/admin/colors).
 */
import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import {
  COLOR_COMPONENTS,
  COMPONENT_LABELS,
  SURCHARGE_UNITS,
  type ColorComponent,
  type ColorOption,
} from '@/lib/colors';

type AdminFetch = (input: string, init?: RequestInit) => Promise<Response>;

const input =
  'px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-[#F5A623]/50 transition-colors';

export default function ColorsAdmin({ adminFetch }: { adminFetch: AdminFetch }) {
  const [options, setOptions] = useState<ColorOption[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/colors')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setOptions(data))
      .catch((err) => console.error('Failed to load colours:', err));
  }, [adminFetch]);

  if (!options) {
    return <div className="text-sm text-gray-500">Se încarcă...</div>;
  }

  const ofComponent = (c: ColorComponent) =>
    options.filter((o) => o.component === c).sort((a, b) => a.sortOrder - b.sortOrder);

  const update = (id: string, patch: Partial<ColorOption>) =>
    setOptions((list) => list && list.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const makeDefault = (component: ColorComponent, id: string) =>
    setOptions((list) => list && list.map((o) => (o.component === component ? { ...o, isDefault: o.id === id } : o)));

  const remove = (option: ColorOption) =>
    setOptions((list) => {
      if (!list) return list;
      const rest = list.filter((o) => o.id !== option.id);
      // Keep a default: the first remaining colour of the component takes over.
      if (option.isDefault) {
        const next = rest.find((o) => o.component === option.component);
        if (next) return rest.map((o) => (o.id === next.id ? { ...o, isDefault: true } : o));
      }
      return rest;
    });

  const add = (component: ColorComponent) =>
    setOptions((list) => {
      if (!list) return list;
      const own = list.filter((o) => o.component === component);
      const option: ColorOption = {
        id: `${component}-${nanoid(8)}`,
        component,
        name: 'Culoare nouă',
        ral: '',
        hex: '#888888',
        surcharge: 0,
        isDefault: own.length === 0,
        sortOrder: own.reduce((max, o) => Math.max(max, o.sortOrder + 1), 0),
      };
      return [...list, option];
    });

  const move = (component: ColorComponent, id: string, by: -1 | 1) => {
    const own = ofComponent(component);
    const i = own.findIndex((o) => o.id === id);
    const j = i + by;
    if (j < 0 || j >= own.length) return;
    [own[i], own[j]] = [own[j], own[i]];
    const order = new Map(own.map((o, index) => [o.id, index]));
    setOptions((list) => list && list.map((o) => (order.has(o.id) ? { ...o, sortOrder: order.get(o.id)! } : o)));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const missing = COLOR_COMPONENTS.filter((c) => ofComponent(c).length === 0);
      if (missing.length > 0) {
        setError(`Fiecare componentă are nevoie de cel puțin o culoare (lipsă: ${missing.map((c) => COMPONENT_LABELS[c]).join(', ')}).`);
        return;
      }
      const res = await adminFetch('/api/admin/colors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        setError(
          res.status === 400
            ? 'Valori invalide: verifică numele (obligatoriu), codul de culoare și prețurile (0 – 1.000.000).'
            : 'Salvarea a eșuat. Încearcă din nou.',
        );
        return;
      }
      setOptions(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save colours:', err);
      setError('Salvarea a eșuat. Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Culori</h2>
          <p className="text-xs text-gray-500 mt-1">
            Culorile oferite clienților pentru fiecare componentă. Costul suplimentar se adaugă la prețul estimativ (0 =
            inclus în preț).
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 px-6 py-2.5 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-[#F5A623]/20"
        >
          {saving ? 'Se salvează...' : saved ? '✓ Salvat' : 'Salvează'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {COLOR_COMPONENTS.map((component) => {
          const own = ofComponent(component);
          return (
            <section key={component}>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-bold text-white">{COMPONENT_LABELS[component]}</h3>
                <span className="text-xs text-gray-500">Cost suplimentar {SURCHARGE_UNITS[component]}</span>
              </div>
              <div className="hidden md:grid grid-cols-[auto_auto_1fr_6rem_7rem_auto_auto] gap-2 px-1 mb-1 text-[11px] uppercase tracking-wider text-gray-600">
                <span>Ordine</span>
                <span>Culoare</span>
                <span>Nume</span>
                <span>RAL</span>
                <span>Supliment €</span>
                <span>Implicită</span>
                <span />
              </div>
              <div className="space-y-2">
                {own.map((o, index) => (
                  <div
                    key={o.id}
                    className="grid grid-cols-[auto_auto_1fr] md:grid-cols-[auto_auto_1fr_6rem_7rem_auto_auto] items-center gap-2"
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="Mută în sus"
                        disabled={index === 0}
                        onClick={() => move(component, o.id, -1)}
                        className="text-gray-500 hover:text-white disabled:opacity-20 text-xs leading-none cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label="Mută în jos"
                        disabled={index === own.length - 1}
                        onClick={() => move(component, o.id, 1)}
                        className="text-gray-500 hover:text-white disabled:opacity-20 text-xs leading-none cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                    <input
                      type="color"
                      aria-label="Culoare"
                      value={o.hex}
                      onChange={(e) => update(o.id, { hex: e.target.value })}
                      className="w-9 h-9 rounded-lg bg-transparent border border-white/10 cursor-pointer"
                    />
                    <input
                      aria-label="Nume"
                      value={o.name}
                      maxLength={60}
                      onChange={(e) => update(o.id, { name: e.target.value })}
                      className={`${input} min-w-0`}
                    />
                    <input
                      aria-label="Cod RAL"
                      value={o.ral}
                      maxLength={12}
                      placeholder="—"
                      onChange={(e) => update(o.id, { ral: e.target.value })}
                      className={`${input} col-start-3 md:col-start-auto`}
                    />
                    <input
                      type="number"
                      aria-label="Supliment"
                      min={0}
                      step={0.5}
                      value={o.surcharge}
                      onChange={(e) => update(o.id, { surcharge: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className={`${input} text-right col-start-3 md:col-start-auto`}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 col-start-3 md:col-start-auto md:justify-center cursor-pointer">
                      <input
                        type="radio"
                        name={`default-${component}`}
                        checked={o.isDefault}
                        onChange={() => makeDefault(component, o.id)}
                        className="accent-[#F5A623]"
                      />
                      <span className="md:hidden">Implicită</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => remove(o)}
                      disabled={own.length === 1}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30 cursor-pointer col-start-3 md:col-start-auto justify-self-start"
                    >
                      Șterge
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => add(component)}
                className="mt-3 text-xs font-semibold text-[#F5A623] hover:text-[#ffc062] cursor-pointer"
              >
                + Adaugă culoare
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
