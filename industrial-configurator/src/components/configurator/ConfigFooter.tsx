'use client';

import { useConfiguratorStore } from '@/stores/useConfiguratorStore';

interface ConfigFooterProps {
  length: number;
  width: number;
  height: number;
  estimatedPrice: number;
}

export default function ConfigFooter({ length, width, height, estimatedPrice }: ConfigFooterProps) {
  const { currentStep, nextStep, showFoundation } = useConfiguratorStore();

  const summary = showFoundation
    ? `${length} x ${width} x ${height} m | Structură Metalică | Fundație`
    : `${length} x ${width} x ${height} m | Structură Metalică`;

  return (
    <footer className="w-full bg-[#1A1A1A] text-white flex flex-row items-center justify-between border-t-4 border-[var(--color-primary)] shrink-0 z-50 h-[70px] md:h-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-0.5 md:gap-12 px-4 md:px-8 py-2 md:py-4 flex-1 min-w-0">
        {/* Total Price */}
        <div className="shrink-0 flex items-baseline gap-2 md:block">
          <span className="text-[10px] md:text-sm text-gray-400 block mb-0 md:mb-1">Preț Total:</span>
          <span className="text-lg md:text-4xl font-serif">
            €{estimatedPrice.toLocaleString('en-US')}
          </span>
        </div>

        {/* Separator */}
        <div className="hidden md:block w-px h-10 bg-gray-600 shrink-0" />

        {/* Summary text */}
        <div className="text-[10px] md:text-sm text-gray-400 md:text-gray-300 truncate w-full md:w-auto overflow-hidden">
          {summary}
        </div>
      </div>

      {/* Continue Button */}
      {currentStep < 4 ? (
        <button 
          onClick={nextStep}
          className="h-full px-5 md:px-12 bg-gradient-to-r from-[var(--color-primary)] to-[#E6951A] text-black font-bold text-sm md:text-lg hover:brightness-110 transition-all flex items-center justify-center gap-1.5 self-stretch cursor-pointer shrink-0"
        >
          <span className="hidden sm:inline">CONTINUĂ</span>
          <span className="sm:hidden">CONT.</span>
          <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : (
        <div className="h-full px-5 md:px-12 bg-[#111] flex items-center justify-center self-stretch border-l border-gray-800 shrink-0">
          <span className="text-gray-500 font-bold text-sm md:text-base">SUMAR</span>
        </div>
      )}
    </footer>
  );
}
