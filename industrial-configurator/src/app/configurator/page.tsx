'use client';

import { Suspense } from 'react';
import { useProgress } from '@react-three/drei';
import ConfiguratorLayout from '@/components/configurator/ConfiguratorLayout';
import ConfiguratorEngine from '@/components/configurator/ConfiguratorEngine';

function GlobalLoader() {
  const { active, progress } = useProgress();

  if (!active && progress === 100) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white transition-opacity duration-500">
      <div className="relative flex flex-col items-center">
        <div className="relative w-16 h-16 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[var(--color-primary)] animate-spin" />
        </div>
        
        <div className="w-48 h-1 bg-gray-100 rounded-full overflow-hidden mb-4 relative">
          <div 
            className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <p className="text-gray-400 font-bold tracking-widest text-sm uppercase">Loading Environment {Math.round(progress)}%</p>
      </div>
    </div>
  );
}

export default function ConfiguratorPage() {
  return (
    <main className="w-full h-screen overflow-hidden bg-[var(--color-bg-primary)]">
      <GlobalLoader />
      <ConfiguratorLayout>
        <ConfiguratorEngine />
      </ConfiguratorLayout>
    </main>
  );
}
