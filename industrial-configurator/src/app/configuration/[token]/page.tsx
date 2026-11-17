'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { requestHallFraming } from '@/components/3d/hall/framing';
import { configurationDataSchema } from '@/lib/validation/configuration';

export default function ConfigurationTokenPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [error, setError] = useState('');

  const setLength = useConfiguratorStore((s) => s.setLength);
  const setWidth = useConfiguratorStore((s) => s.setWidth);
  const setHeight = useConfiguratorStore((s) => s.setHeight);
  const setShowFoundation = useConfiguratorStore((s) => s.setShowFoundation);
  const setHasSandwichPanels = useConfiguratorStore((s) => s.setHasSandwichPanels);
  const setIsIsolated = useConfiguratorStore((s) => s.setIsIsolated);
  const setInsulation = useConfiguratorStore((s) => s.setInsulation);
  const resetConfigurator = useConfiguratorStore((s) => s.resetConfigurator);
  const setColors = useConfiguratorStore((s) => s.setColors);
  const setRoofType = useConfiguratorStore((s) => s.setRoofType);
  const setHighSide = useConfiguratorStore((s) => s.setHighSide);
  const setOpenings = useOpeningsStore((s) => s.setOpenings);
  const resetOpenings = useOpeningsStore((s) => s.resetOpenings);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/configurations/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Configuration not found');
        return res.json();
      })
      .then((config) => {
        const parsed = configurationDataSchema.safeParse(config.data);
        if (!parsed.success) throw new Error('Invalid configuration data');
        const data = parsed.data;

        // Start from a clean slate so nothing from a previous session leaks in
        resetConfigurator();
        resetOpenings();

        setLength(data.dimensions.length);
        setWidth(data.dimensions.width);
        setHeight(data.dimensions.height);
        setShowFoundation(data.foundation);
        setHasSandwichPanels(data.sandwichPanels);
        if (data.insulation > 0) {
          setIsIsolated(true);
          setInsulation(data.insulation);
        }
        setRoofType(data.roofType ?? 'gable');
        setHighSide(data.highSide ?? 'right');
        setColors(data.colors);
        // setOpenings normalises legacy (posX/posY) openings itself
        setOpenings(data.openingsList);

        requestHallFraming();

        // Redirect to configurator
        router.push('/configurator');
      })
      .catch((err) => {
        console.error('Failed to load configuration:', err);
        setError('Configurarea nu a fost găsită.');
      });
  }, [token, router, resetConfigurator, resetOpenings, setLength, setWidth, setHeight, setShowFoundation, setHasSandwichPanels, setIsIsolated, setInsulation, setOpenings, setColors, setRoofType, setHighSide]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0f0f0f' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Eroare</h1>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F5A623] text-black font-bold text-sm hover:bg-[#e6951a] transition-colors"
          >
            Înapoi la Pagina Principală
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' }}>
      <div className="text-center">
        <div className="text-3xl font-extrabold tracking-tight select-none mb-6">
          <span className="text-white">Car</span>
          <span className="text-[#F5A623]">Star</span>
        </div>
        <div className="w-10 h-10 rounded-full border-2 border-gray-800 border-t-[#F5A623] animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm font-medium">Se încarcă configurarea…</p>
      </div>
    </div>
  );
}
