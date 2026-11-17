'use client';

/**
 * Colour choice for some of the hall's components: one row of swatches per component, from the admin's catalogue.
 * A colour that costs extra shows its surcharge.
 */
import { useShallow } from 'zustand/react/shallow';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { COMPONENT_LABELS, SURCHARGE_UNITS, optionsFor, type ColorComponent, type ColorOption } from '@/lib/colors';

const euro = (value: number) => `€${value.toLocaleString('ro-RO', { maximumFractionDigits: 2 })}`;

/** Light colours get a dark check mark and a visible border. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

function SwatchRow({ component }: { component: ColorComponent }) {
  const { palette, chosen, setColor } = useConfiguratorStore(
    useShallow((s) => ({ palette: s.palette, chosen: s.colors[component], setColor: s.setColor })),
  );
  const options = optionsFor(palette, component);
  const current = options.find((o) => o.id === chosen.id);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-sm font-bold text-black">{COMPONENT_LABELS[component]}</span>
        <span className="text-xs text-gray-500 text-right">
          {chosen.name}
          {current && current.ral && <span className="text-gray-400"> · RAL {current.ral}</span>}
          {current && current.surcharge > 0 && (
            <span className="block text-[11px] font-semibold text-[var(--color-primary)]">
              +{euro(current.surcharge)} {SURCHARGE_UNITS[component]}
            </span>
          )}
        </span>
      </div>
      <div role="radiogroup" aria-label={COMPONENT_LABELS[component]} className="flex flex-wrap gap-2">
        {options.map((option: ColorOption) => {
          const selected = option.id === chosen.id;
          const light = isLight(option.hex);
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={`${option.name}${option.ral ? ` (RAL ${option.ral})` : ''}${option.surcharge > 0 ? ` · +${euro(option.surcharge)} ${SURCHARGE_UNITS[component]}` : ''}`}
              onClick={() => setColor(component, option)}
              className={`relative w-9 h-9 rounded-full cursor-pointer transition-transform hover:scale-110 ${
                selected ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : ''
              } ${light ? 'border border-gray-300' : ''}`}
              style={{ backgroundColor: option.hex }}
            >
              {selected && (
                <svg
                  className={`absolute inset-0 m-auto w-4 h-4 ${light ? 'text-gray-800' : 'text-white'}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {option.surcharge > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--color-primary)] text-[9px] leading-[14px] text-black font-bold text-center"
                >
                  €
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ColorPicker({ title, components }: { title: string; components: readonly ColorComponent[] }) {
  return (
    <div>
      <div className="mb-3">
        <span className="text-sm font-bold text-black block">{title}</span>
        <span className="text-xs text-gray-500">Culorile marcate cu € au cost suplimentar</span>
      </div>
      <div className="space-y-5">
        {components.map((c) => (
          <SwatchRow key={c} component={c} />
        ))}
      </div>
    </div>
  );
}
