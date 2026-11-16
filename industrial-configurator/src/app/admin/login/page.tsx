'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

/** Only same-site admin paths are allowed as a post-login redirect. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/admin') || value.startsWith('//') || value.includes('\\')) {
    return '/admin';
  }
  return value.startsWith('/admin/login') ? '/admin' : value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace(safeNext(searchParams.get('next')));
        router.refresh();
        return;
      }
      setError(
        res.status === 429
          ? 'Prea multe încercări. Încearcă din nou mai târziu.'
          : res.status === 503
            ? 'Autentificarea nu este configurată pe server.'
            : 'Credențiale invalide',
      );
    } catch {
      setError('Eroare de rețea. Încearcă din nou.');
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
      <h2 className="text-xl font-bold text-white mb-6">Autentificare</h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="admin-username" className="block text-sm font-medium text-gray-400 mb-1.5">Utilizator</label>
          <input
            id="admin-username"
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={100}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-600 outline-none focus:border-[#F5A623]/50 transition-colors"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="block text-sm font-medium text-gray-400 mb-1.5">Parolă</label>
          <input
            id="admin-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            maxLength={200}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-600 outline-none focus:border-[#F5A623]/50 transition-colors"
            placeholder="••••••"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full mt-6 py-3 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-[#F5A623]/20"
      >
        {submitting ? 'Se verifică...' : 'Intră în Panou'}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #0f0f0f 100%)' }}>
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block text-3xl font-extrabold tracking-tight select-none mb-2">
            <span className="text-white">Car</span>
            <span className="text-[#F5A623]">Star</span>
          </Link>
          <p className="text-gray-500 text-sm font-medium">Panou de Administrare</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
