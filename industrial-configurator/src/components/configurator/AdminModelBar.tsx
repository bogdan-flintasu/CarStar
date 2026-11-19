'use client';

/**
 * Admin-only bar over the 3D view: saves the hall on screen as a predefined model ("model"), or updates the model
 * being edited. Opened from the admin page with `/configurator?editModel=<id>` (edit) or `?newModel=1` (blank hall).
 * Shown only when /api/auth/session says the visitor is an admin; the admin APIs check the session themselves.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { applyHallConfiguration, currentHallData } from '@/lib/applyHallConfiguration';
import { requestHallFraming } from '@/components/3d/hall/framing';
import { takeHallSnapshot } from '@/components/3d/hall/snapshot';
import type { HallModelAdmin } from '@/lib/validation/models';

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; text: string } | { kind: 'error'; text: string };

/**
 * Picture of the finished hall: walls shown (which also hides the dimension lines), no selected opening and no
 * placement tool. The admin's wall toggle is restored afterwards.
 */
async function takeModelPicture(): Promise<string | undefined> {
  const hall = useConfiguratorStore.getState();
  const openings = useOpeningsStore.getState();
  const wallsToggle = hall.wallsToggle;
  hall.setWallsVisible(true);
  openings.selectOpening(null);
  openings.setActiveTool(null);
  try {
    return (await takeHallSnapshot()) ?? undefined;
  } finally {
    useConfiguratorStore.getState().setWallsVisible(wallsToggle);
  }
}

export default function AdminModelBar() {
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<{ name: string; description: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Who is looking, and what the admin page asked for.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then(async ({ admin: isAdmin }: { admin: boolean }) => {
        if (cancelled || !isAdmin) return;
        setAdmin(true);
        const query = new URLSearchParams(window.location.search);
        const editId = query.get('editModel');
        if (query.get('newModel')) {
          useConfiguratorStore.getState().resetConfigurator();
          useOpeningsStore.getState().resetOpenings();
          requestHallFraming();
        } else if (editId) {
          const models: HallModelAdmin[] = await fetch('/api/admin/models', { cache: 'no-store' }).then((r) => r.json());
          const model = models.find((m) => m.id === editId);
          if (!model || cancelled) return;
          applyHallConfiguration(model.data);
          // Show the walls: the picture is taken of what is on screen.
          useConfiguratorStore.getState().setWallsVisible(true);
          setEditing({ id: model.id, name: model.name });
        }
        // Drop the query, so a reload does not load the model again over later changes.
        window.history.replaceState(null, '', window.location.pathname);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!admin) return null;

  const fail = (text: string) => setStatus({ kind: 'error', text });

  const createModel = async () => {
    if (!form || !form.name.trim()) return fail('Dă un nume modelului.');
    setStatus({ kind: 'saving' });
    try {
      const thumbnail = await takeModelPicture();
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, data: currentHallData(), thumbnail }),
      });
      if (!res.ok) return fail(res.status === 401 ? 'Sesiunea a expirat. Autentifică-te din nou.' : 'Salvarea a eșuat.');
      const model: HallModelAdmin = await res.json();
      setEditing({ id: model.id, name: model.name });
      setForm(null);
      setStatus({ kind: 'saved', text: `Model „${model.name}” creat.` });
    } catch {
      fail('Salvarea a eșuat.');
    }
  };

  const updateModel = async () => {
    if (!editing) return;
    setStatus({ kind: 'saving' });
    try {
      const thumbnail = await takeModelPicture();
      const res = await fetch(`/api/admin/models/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: currentHallData(), ...(thumbnail ? { thumbnail } : {}) }),
      });
      if (!res.ok) return fail(res.status === 404 ? 'Modelul nu mai există.' : 'Salvarea a eșuat.');
      setStatus({ kind: 'saved', text: `Modelul „${editing.name}” a fost actualizat.` });
    } catch {
      fail('Salvarea a eșuat.');
    }
  };

  const button =
    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap';

  return (
    <div className="absolute top-3 left-3 right-3 md:right-auto md:max-w-[min(560px,calc(100%-24px))] z-20 bg-gray-950/90 backdrop-blur-md text-white rounded-xl shadow-lg px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold uppercase tracking-wider text-[10px] text-[var(--color-primary)]">Admin · Modele</span>
        <span className="text-gray-300 min-w-0 truncate">
          {editing ? (
            <>
              Editezi: <strong className="text-white">{editing.name}</strong>
            </>
          ) : (
            'Configurează hala, apoi salveaz-o ca model.'
          )}
        </span>
        <span className="flex-1" />
        {editing && (
          <button type="button" disabled={status.kind === 'saving'} onClick={updateModel} className={`${button} bg-[var(--color-primary)] text-[var(--ui-accent-text)] hover:bg-[var(--color-primary-hover)]`}>
            Actualizează modelul
          </button>
        )}
        <button
          type="button"
          disabled={status.kind === 'saving'}
          onClick={() => setForm(form ? null : { name: '', description: '' })}
          className={`${button} ${editing ? 'bg-white/10 hover:bg-white/20' : 'bg-[var(--color-primary)] text-[var(--ui-accent-text)] hover:bg-[var(--color-primary-hover)]'}`}
        >
          Salvează ca model nou
        </button>
        <Link href="/admin" className="text-gray-400 hover:text-white underline-offset-2 hover:underline">
          Admin
        </Link>
      </div>

      {form && (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createModel();
          }}
        >
          <input
            autoFocus
            required
            maxLength={80}
            placeholder="Nume (ex. Hală depozit 12 × 24 m)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none focus:border-[var(--color-primary)]"
          />
          <textarea
            maxLength={400}
            rows={2}
            placeholder="Descriere scurtă pentru clienți (opțional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 outline-none focus:border-[var(--color-primary)] resize-none"
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={status.kind === 'saving'} className={`${button} bg-[var(--color-primary)] text-[var(--ui-accent-text)] hover:bg-[var(--color-primary-hover)]`}>
              {status.kind === 'saving' ? 'Se salvează…' : 'Salvează'}
            </button>
            <span className="text-gray-400">Poza modelului se face din vederea 3D de acum.</span>
          </div>
        </form>
      )}

      {status.kind === 'saved' && <p className="mt-2 text-green-400 font-semibold">{status.text}</p>}
      {status.kind === 'error' && (
        <p role="alert" className="mt-2 text-red-400 font-semibold">
          {status.text}
        </p>
      )}
    </div>
  );
}
