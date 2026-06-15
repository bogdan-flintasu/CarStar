'use client';

import Link from 'next/link';
import StepIndicator from './StepIndicator';
import type { ConfigStep } from '@/stores/useConfiguratorStore';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';

interface ConfigHeaderProps {
  currentStep: ConfigStep;
  onStepClick: (step: ConfigStep) => void;
}

export default function ConfigHeader({ currentStep, onStepClick }: ConfigHeaderProps) {
  const resetConfigurator = useConfiguratorStore(s => s.resetConfigurator);
  const resetOpenings = useOpeningsStore(s => s.resetOpenings);

  const handleReset = () => {
    resetConfigurator();
    resetOpenings();
  };

  return (
    <header className="relative z-50 bg-white border-b border-gray-200 shadow-sm flex flex-col items-center justify-center pt-2 md:pt-4 pb-2 min-h-16 shrink-0">
      
      {/* Top row for Mobile (Actions + Logo) */}
      <div className="w-full flex justify-between items-center px-4 md:px-6 mb-2 md:mb-0 md:absolute md:top-1/2 md:-translate-y-1/2 md:left-0 md:right-0 md:pointer-events-none">
        
        {/* Left side actions and logo */}
        <div className="flex items-center gap-2 md:gap-4 pointer-events-auto md:ml-6">
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
          <Link href="/" className="text-base md:text-lg font-extrabold tracking-tight select-none ml-1 md:ml-0">
            <span className="text-gray-900">Car</span>
            <span className="text-[#F5A623]">Star</span>
          </Link>
        </div>

        {/* Right side actions */}
        <div className="flex items-center pointer-events-auto md:mr-6">
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
      <div className="w-full max-w-4xl px-2 md:px-6 overflow-x-auto no-scrollbar">
        <StepIndicator currentStep={currentStep} onStepClick={onStepClick} />
      </div>

    </header>
  );
}
