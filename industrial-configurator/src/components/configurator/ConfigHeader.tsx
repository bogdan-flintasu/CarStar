'use client';

import Link from 'next/link';
import StepIndicator from './StepIndicator';
import type { ConfigStep } from '@/stores/useConfiguratorStore';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { requestHallFraming } from '@/components/3d/hall/framing';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { useBrand } from './UiThemeScope';

interface ConfigHeaderProps {
  currentStep: ConfigStep;
  onStepClick: (step: ConfigStep) => void;
}

export default function ConfigHeader({ currentStep, onStepClick }: ConfigHeaderProps) {
  const resetConfigurator = useConfiguratorStore(s => s.resetConfigurator);
  const resetOpenings = useOpeningsStore(s => s.resetOpenings);
  const brand = useBrand();

  const handleReset = () => {
    resetConfigurator();
    resetOpenings();
    requestHallFraming();
  };

  return (
    <header className="relative z-50 bg-white border-b border-gray-200 shadow-sm flex flex-col items-center justify-center pt-2 md:pt-4 pb-2 min-h-16 shrink-0 md:grid md:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-6">
      
      {/* Top row on phones (actions + logo); on wider screens its two halves become the outer grid columns around the steps. */}
      <div className="w-full flex justify-between items-center px-4 mb-2 md:contents">
        
        {/* Left side actions and logo */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0 md:col-start-1 md:row-start-1">
          <Link
            href="/"
            className="flex items-center gap-1 md:gap-2 text-xs md:text-sm font-bold text-gray-600 hover:text-black transition-colors py-1.5 md:py-2 px-2 md:px-3 hover:bg-gray-100 rounded-lg"
          >
            <svg
              className="w-4 h-4 md:w-4.5 md:h-4.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span className="hidden sm:inline">Înapoi</span>
          </Link>
          <span className="hidden sm:block h-6 w-px bg-gray-200" />
          <Link href="/" className="flex items-center text-base md:text-lg font-extrabold tracking-tight select-none ml-1 md:ml-0 text-gray-900 min-w-0 max-w-[40vw] md:max-w-[12rem] xl:max-w-xs" title={brand.name}>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the logo is a user upload served by our own route (SVG or raster)
              <img src={brand.logoUrl} alt={brand.name} className="h-7 md:h-9 w-auto max-w-full object-contain" />
            ) : (
              <span className="truncate">{brand.name}</span>
            )}
          </Link>
        </div>

        {/* Right side actions */}
        <div className="flex items-center md:col-start-3 md:row-start-1 md:justify-self-end">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 md:gap-2 text-xs md:text-sm font-bold text-red-600 hover:text-red-700 transition-colors py-1.5 md:py-2 px-2 md:px-3 hover:bg-red-50 rounded-lg cursor-pointer"
          >
            <svg className="w-4 h-4 md:w-4.5 md:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Reconfigurează</span>
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="w-full max-w-4xl px-2 md:px-0 md:justify-self-center md:col-start-2 md:row-start-1 overflow-x-auto no-scrollbar">
        <StepIndicator currentStep={currentStep} onStepClick={onStepClick} />
      </div>

    </header>
  );
}
