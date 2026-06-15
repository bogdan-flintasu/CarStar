'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PricesData {
  id: string;
  structurePerM3: number;
  foundationPerM2: number;
  sandwichPerM2: number;
  windowPerUnit: number;
  doorPerUnit: number;
  bigDoorPerUnit: number;
}

interface ConfigData {
  id: string;
  token: string;
  data: Record<string, unknown>;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      onLogin();
    } else {
      setError('Credențiale invalide');
      setTimeout(() => setError(''), 3000);
    }
  };

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

        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">Autentificare</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Utilizator</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-600 outline-none focus:border-[#F5A623]/50 transition-colors"
                placeholder="admin"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Parolă</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-600 outline-none focus:border-[#F5A623]/50 transition-colors"
                placeholder="••••••"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-6 py-3 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors cursor-pointer shadow-lg shadow-[#F5A623]/20"
          >
            Intră în Panou
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Price Field ──────────────────────────────────────────────────────────────
function PriceField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-800/50 last:border-0">
      <div>
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs text-gray-500 ml-2">({unit})</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-sm">€</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          step={1}
          min={0}
          className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-right outline-none focus:border-[#F5A623]/50 transition-colors font-medium"
        />
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'prices' | 'configs'>('prices');
  const [prices, setPrices] = useState<PricesData | null>(null);
  const [configs, setConfigs] = useState<ConfigData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch prices
  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((data) => setPrices(data))
      .catch((err) => console.error('Failed to load prices:', err))
      .finally(() => setLoading(false));
  }, []);

  // Fetch configs when tab switches
  useEffect(() => {
    if (activeTab === 'configs') {
      fetch('/api/configurations')
        .then((r) => r.json())
        .then((data) => setConfigs(data))
        .catch((err) => console.error('Failed to load configs:', err));
    }
  }, [activeTab]);

  const handleSavePrices = async () => {
    if (!prices) return;
    setSaving(true);
    try {
      const res = await fetch('/api/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structurePerM3: prices.structurePerM3,
          foundationPerM2: prices.foundationPerM2,
          sandwichPerM2: prices.sandwichPerM2,
          windowPerUnit: prices.windowPerUnit,
          doorPerUnit: prices.doorPerUnit,
          bigDoorPerUnit: prices.bigDoorPerUnit,
        }),
      });
      const updated = await res.json();
      setPrices(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save prices:', err);
    } finally {
      setSaving(false);
    }
  };

  const updatePrice = (field: keyof PricesData, value: number) => {
    if (!prices) return;
    setPrices({ ...prices, [field]: value });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <div className="w-8 h-8 rounded-full border-2 border-gray-800 border-t-[#F5A623] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #0f0f0f 0%, #111 100%)' }}>
      {/* Header */}
      <header className="border-b border-white/5 bg-black/30 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-extrabold tracking-tight select-none">
              <span className="text-white">Car</span>
              <span className="text-[#F5A623]">Star</span>
            </Link>
            <span className="text-gray-600">|</span>
            <span className="text-sm font-medium text-gray-400">Admin</span>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-white transition-colors font-medium"
          >
            ← Înapoi la site
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-white/5 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('prices')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'prices'
                ? 'bg-[#F5A623] text-black shadow-lg shadow-[#F5A623]/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Prețuri
          </button>
          <button
            onClick={() => setActiveTab('configs')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'configs'
                ? 'bg-[#F5A623] text-black shadow-lg shadow-[#F5A623]/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Configurări Salvate
          </button>
        </div>

        {/* ── Prices Tab ─────────────────────────────── */}
        {activeTab === 'prices' && prices && (
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Tabel de Prețuri</h2>
                <p className="text-xs text-gray-500 mt-1">Aceste prețuri sunt folosite pentru calculul estimativ în configurator.</p>
              </div>
              <button
                onClick={handleSavePrices}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-[#F5A623]/20"
              >
                {saving ? 'Se salvează...' : saved ? '✓ Salvat' : 'Salvează'}
              </button>
            </div>

            <div className="space-y-0">
              <PriceField
                label="Structură metalică"
                unit="per m³"
                value={prices.structurePerM3}
                onChange={(v) => updatePrice('structurePerM3', v)}
              />
              <PriceField
                label="Fundație"
                unit="per m²"
                value={prices.foundationPerM2}
                onChange={(v) => updatePrice('foundationPerM2', v)}
              />
              <PriceField
                label="Panouri sandwich"
                unit="per m²"
                value={prices.sandwichPerM2}
                onChange={(v) => updatePrice('sandwichPerM2', v)}
              />
              <PriceField
                label="Fereastră"
                unit="per bucată"
                value={prices.windowPerUnit}
                onChange={(v) => updatePrice('windowPerUnit', v)}
              />
              <PriceField
                label="Ușă pedestră"
                unit="per bucată"
                value={prices.doorPerUnit}
                onChange={(v) => updatePrice('doorPerUnit', v)}
              />
              <PriceField
                label="Ușă industrială"
                unit="per bucată"
                value={prices.bigDoorPerUnit}
                onChange={(v) => updatePrice('bigDoorPerUnit', v)}
              />
            </div>
          </div>
        )}

        {/* ── Configs Tab ────────────────────────────── */}
        {activeTab === 'configs' && (
          <div className="space-y-3">
            {configs.length === 0 ? (
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-12 text-center">
                <p className="text-gray-500 text-sm">Nu există configurări salvate.</p>
              </div>
            ) : (
              configs.map((cfg) => {
                const d = cfg.data as Record<string, unknown>;
                const dims = d.dimensions as { length?: number; width?: number; height?: number } | undefined;

                return (
                  <div
                    key={cfg.id}
                    className="bg-white/[0.03] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-mono text-[#F5A623] bg-[#F5A623]/10 px-2 py-0.5 rounded">
                            {cfg.token}
                          </span>
                          <span className="text-xs text-gray-600">
                            {new Date(cfg.createdAt).toLocaleDateString('ro-RO', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                          {dims && (
                            <span className="text-gray-400">
                              <span className="text-gray-600">Dimensiuni: </span>
                              <span className="text-white font-medium">{dims.length} × {dims.width} × {dims.height} m</span>
                            </span>
                          )}
                          {d.estimatedPrice !== undefined && (
                            <span className="text-gray-400">
                              <span className="text-gray-600">Preț: </span>
                              <span className="text-white font-medium">€{(d.estimatedPrice as number)?.toLocaleString('en-US')}</span>
                            </span>
                          )}
                        </div>

                        {(cfg.userName || cfg.userEmail || cfg.userPhone) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                            {cfg.userName && <span>👤 {cfg.userName}</span>}
                            {cfg.userEmail && <span>✉ {cfg.userEmail}</span>}
                            {cfg.userPhone && <span>📞 {cfg.userPhone}</span>}
                          </div>
                        )}
                      </div>

                      <Link
                        href={`/configuration/${cfg.token}`}
                        className="shrink-0 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors font-medium"
                      >
                        Vizualizează →
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);

  if (!authenticated) {
    return <LoginScreen onLogin={() => setAuthenticated(true)} />;
  }

  return <AdminDashboard />;
}
