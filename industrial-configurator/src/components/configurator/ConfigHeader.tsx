'use client';

import Link from 'next/link';
import StepIndicator from './StepIndicator';
import type { ConfigStep } from '@/stores/useConfiguratorStore';

interface ConfigHeaderProps {
  currentStep: ConfigStep;
  onStepClick: (step: ConfigStep) => void;
}

export default function ConfigHeader({ currentStep, onStepClick }: ConfigHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm flex flex-col items-center justify-center pt-4 pb-2">

      {/* Step indicator */}
      <div className="w-full max-w-4xl px-6">
        <StepIndicator currentStep={currentStep} onStepClick={onStepClick} />
      </div>
    </header>
  );
}
