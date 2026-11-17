'use client';

/**
 * Predefined halls the admin offers ("modele"): picking one loads it into the configurator, where every option stays
 * editable. Each card shows the model's estimated price with the current prices and colour surcharges.
 * Renders nothing when there are no published models.
 */
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { applyHallConfiguration } from '@/lib/applyHallConfiguration';
import { calculatePrice, countOpenings } from '@/lib/pricing';
import { surchargeRates } from '@/lib/colors';
import { hallLabel, type HallModelSummary } from '@/lib/validation/models';

/** Fetched each time step 1 opens, so models the admin just saved show up; a failed fetch just shows none. */
function loadModels(): Promise<HallModelSummary[]> {
  return fetch('/api/models', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : []))
    .then((data) => (Array.isArray(data) ? data : []))
    .catch(() => []);
}

export default function ModelGallery() {
  const [models, setModels] = useState<HallModelSummary[]>([]);
  const { prices, palette, current } = useConfiguratorStore(
    useShallow((s) => ({ prices: s.prices, palette: s.palette, current: s.model })),
  );

  useEffect(() => {
    let alive = true;
    void loadModels().then((list) => alive && setModels(list));
    return () => {
      alive = false;
    };
  }, []);

  if (models.length === 0) return null;

  const priceOf = ({ data }: HallModelSummary) =>
    calculatePrice(
      {
        ...data.dimensions,
        showFoundation: data.foundation,
        hasSandwichPanels: data.sandwichPanels,
        roofType: data.roofType,
      },
      countOpenings(data.openingsList),
      prices,
      surchargeRates(data.colors, palette),
    );

  return (
    <div className="mb-8">
      <div className="mb-3">
        <span className="text-sm font-bold text-black block">Pornește de la un model</span>
        <span className="text-xs text-gray-500">Alege o hală gata configurată, apoi modifică tot ce vrei.</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {models.map((model) => {
          const selected = current?.id === model.id;
          return (
            <button
              key={model.id}
              type="button"
              aria-pressed={selected}
              onClick={() => applyHallConfiguration(model.data, { id: model.id, name: model.name })}
              title={model.description || model.name}
              className={`text-left rounded-xl border-2 overflow-hidden transition-all cursor-pointer bg-white ${
                selected
                  ? 'border-[var(--color-primary)] shadow-[0_0_15px_rgba(245,166,35,0.15)]'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="aspect-[16/10] bg-gray-100">
                {model.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- a small API image, already sized
                  <img src={model.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-2.5">
                <span className="block text-xs font-bold text-black leading-snug line-clamp-2">{model.name}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{hallLabel(model.data)}</span>
                <span className="block text-xs font-bold text-[var(--color-primary)] mt-1">
                  de la €{priceOf(model).toLocaleString('en-US')}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {current && (
        <p className="mt-3 text-xs text-gray-500">
          Pornit de la modelul <strong className="text-black">{current.name}</strong>. Orice modificare rămâne a ta.
        </p>
      )}
    </div>
  );
}
