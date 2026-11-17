'use client';

/**
 * Admin list of predefined halls ("modele"): rename, describe, publish or hide, reorder, delete, and open one in the
 * configurator to change the hall itself (the configurator's admin bar saves it back).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { HallModelAdmin } from '@/lib/validation/models';

type AdminFetch = (input: string, init?: RequestInit) => Promise<Response>;

const input =
  'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-[#F5A623]/50 transition-colors';

export function describeHall(data: HallModelAdmin['data']): string {
  const { length, width, height } = data.dimensions;
  const roof = data.roofType === 'mono' ? 'o apă' : '2 ape';
  const openings = data.openingsList.length;
  return `${length} × ${width} × ${height} m · ${roof}${openings ? ` · ${openings} deschideri` : ''}`;
}

export default function ModelsAdmin({ adminFetch }: { adminFetch: AdminFetch }) {
  const [models, setModels] = useState<HallModelAdmin[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/models')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setModels(data))
      .catch(() => setError('Modelele nu au putut fi încărcate.'));
  }, [adminFetch]);

  const patch = async (id: string, changes: Partial<Pick<HallModelAdmin, 'name' | 'description' | 'published' | 'sortOrder'>>) => {
    setError('');
    const res = await adminFetch(`/api/admin/models/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      setError('Salvarea a eșuat. Verifică numele (obligatoriu, max. 80 caractere).');
      return;
    }
    const updated: HallModelAdmin = await res.json();
    setModels((list) => list && list.map((m) => (m.id === id ? updated : m)));
  };

  const remove = async (model: HallModelAdmin) => {
    if (!window.confirm(`Ștergi definitiv modelul „${model.name}”? Configurările salvate de clienți rămân neschimbate.`)) return;
    const res = await adminFetch(`/api/admin/models/${model.id}`, { method: 'DELETE' });
    if (res.ok) setModels((list) => list && list.filter((m) => m.id !== model.id));
    else setError('Ștergerea a eșuat.');
  };

  /** Swap with the neighbour and renumber the whole list, so the order is always 0..n-1. */
  const move = async (index: number, by: -1 | 1) => {
    if (!models) return;
    const next = [...models];
    const j = index + by;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    const renumbered = next.map((m, i) => ({ ...m, sortOrder: i }));
    setModels(renumbered);
    await Promise.all(
      renumbered.filter((m, i) => models.find((o) => o.id === m.id)?.sortOrder !== i).map((m) => patch(m.id, { sortOrder: m.sortOrder })),
    );
  };

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Modele de hale</h2>
          <p className="text-xs text-gray-500 mt-1">
            Hale predefinite pe care clienții le pot alege ca punct de plecare și apoi modifica. Un model se creează din
            configurator: configurează hala și apasă „Salvează ca model nou”.
          </p>
        </div>
        <Link
          href="/configurator?newModel=1"
          className="shrink-0 px-5 py-2.5 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors shadow-lg shadow-[#F5A623]/20"
        >
          + Model nou
        </Link>
      </div>

      {error && (
        <div role="alert" className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      {!models ? (
        <p className="text-sm text-gray-500">Se încarcă...</p>
      ) : models.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">Nu există modele încă.</p>
      ) : (
        <div className="space-y-3">
          {models.map((model, index) => (
            <div key={model.id} className="flex flex-col md:flex-row gap-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
              <div className="md:w-48 shrink-0 aspect-[16/10] rounded-lg overflow-hidden bg-white/5">
                {model.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small API image, already sized
                  <img src={model.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">Fără poză</div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  aria-label="Nume"
                  defaultValue={model.name}
                  maxLength={80}
                  onBlur={(e) => e.target.value.trim() !== model.name && void patch(model.id, { name: e.target.value })}
                  className={`${input} font-semibold`}
                />
                <textarea
                  aria-label="Descriere"
                  defaultValue={model.description}
                  maxLength={400}
                  rows={2}
                  placeholder="Descriere pentru clienți"
                  onBlur={(e) => e.target.value.trim() !== model.description && void patch(model.id, { description: e.target.value })}
                  className={`${input} resize-none`}
                />
                <p className="text-xs text-gray-500">{describeHall(model.data)}</p>
              </div>
              <div className="flex md:flex-col gap-2 md:w-44 shrink-0 text-sm">
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={model.published}
                    onChange={(e) => void patch(model.id, { published: e.target.checked })}
                    className="accent-[#F5A623]"
                  />
                  Vizibil clienților
                </label>
                <Link
                  href={`/configurator?editModel=${model.id}`}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 text-center"
                >
                  Editează hala
                </Link>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Mută în sus"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Mută în jos"
                    disabled={index === models.length - 1}
                    onClick={() => void move(index, 1)}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    ▼
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(model)}
                  className="text-xs text-red-400 hover:text-red-300 cursor-pointer text-left"
                >
                  Șterge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
