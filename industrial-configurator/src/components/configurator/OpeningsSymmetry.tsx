'use client';

/** T1e: the symmetry selector of the closings step (per session) and its hint line. */
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { SYMMETRY_LABEL, SYMMETRY_MODES } from '@/components/3d/openings/symmetry';

export default function OpeningsSymmetry() {
  const symmetry = useOpeningsStore((s) => s.symmetry);
  const setSymmetry = useOpeningsStore((s) => s.setSymmetry);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-1.5">
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-gray-800">Simetrie</span>
        <select
          value={symmetry}
          onChange={(e) => setSymmetry(e.target.value as typeof symmetry)}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-black cursor-pointer"
        >
          {SYMMETRY_MODES.map((m) => (
            <option key={m} value={m}>
              {SYMMETRY_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      {symmetry !== 'none' && (
        <p className="text-xs text-gray-600">
          {symmetry === 'wallAxis'
            ? 'Pe fronton: un element primește o pereche oglindită față de axă; ușa de garaj se centrează.'
            : 'Fiecare element nou primește o pereche pe peretele opus.'}{' '}
          Elementele existente nu primesc pereche.
        </p>
      )}
    </div>
  );
}
