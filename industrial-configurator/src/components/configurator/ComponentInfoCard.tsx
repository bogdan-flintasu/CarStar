'use client';

/** Info card of the clicked hall component (T5b): name, details and colour, with a close button. Outside the Canvas. */
import { useShallow } from 'zustand/react/shallow';
import { useComponentSelection } from '@/stores/useComponentSelection';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { componentColor } from '@/components/3d/hall/ComponentPicker.map';

export default function ComponentInfoCard() {
  const selected = useComponentSelection((s) => s.selected);
  const clear = useComponentSelection((s) => s.clear);
  const { colors, palette } = useConfiguratorStore(useShallow((s) => ({ colors: s.colors, palette: s.palette })));
  if (!selected) return null;
  const color = componentColor(selected, colors, palette);
  return (
    <div
      role="region"
      aria-label={selected.label}
      className="absolute z-20 left-3 right-3 bottom-16 md:left-6 md:right-auto md:top-28 md:bottom-auto md:w-72 bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm px-4 py-3 text-gray-800"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold leading-tight">{selected.label}</h3>
        <button
          type="button"
          onClick={clear}
          aria-label="Închide"
          className="-mr-1 -mt-1 w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {selected.details.map((d) => (
          <div key={d.label} className="contents">
            <dt className="text-gray-500">{d.label}</dt>
            <dd className="text-right font-medium">{d.value}</dd>
          </div>
        ))}
        <dt className="text-gray-500">Culoare</dt>
        <dd className="flex items-center justify-end gap-1.5 font-medium min-w-0">
          <span className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" style={{ background: color.hex }} />
          <span className="truncate">
            {color.name}
            {color.ral ? ` · ${color.ral}` : ''}
          </span>
        </dd>
      </dl>
    </div>
  );
}
