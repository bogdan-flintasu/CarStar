'use client';

import { useConfiguratorStore } from '@/stores/useConfiguratorStore';

interface ConfigFooterProps {
  length: number;
  width: number;
  height: number;
  estimatedPrice: number;
}

export default function ConfigFooter({ length, width, height, estimatedPrice }: ConfigFooterProps) {
  const { currentStep, nextStep } = useConfiguratorStore();

  // Hardcode based on the screenshot text if needed or just use dynamic summary
  const summary = `${length} x ${width} x ${height} m | Steel Frame | Insulated Panel`;

  return (
    <footer className="w-full bg-[#1A1A1A] text-white flex items-center justify-between border-t-4 border-[var(--color-primary)] shrink-0 z-50">
      <div className="flex items-center gap-12 px-8 py-4">
        {/* Total Price */}
        <div>
          <span className="text-sm text-gray-400 block mb-1">Total Price</span>
          <span className="text-4xl font-serif">
            €{estimatedPrice.toLocaleString('en-US')}
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-10 bg-gray-600" />

        {/* Summary text */}
        <div className="text-sm text-gray-300">
          {summary}
        </div>
      </div>

      {/* Continue Button */}
      {currentStep < 4 ? (
        <button 
          onClick={nextStep}
          className="h-full px-12 bg-gradient-to-r from-[var(--color-primary)] to-[#E6951A] text-black font-bold text-lg hover:brightness-110 transition-all flex items-center gap-2 self-stretch cursor-pointer"
        >
          CONTINUE
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : (
        <div className="h-full px-12 bg-[#111] flex items-center justify-center self-stretch border-l border-gray-800">
          <span className="text-gray-500 font-bold">SUMMARY</span>
        </div>
      )}
    </footer>
  );
}
