'use client';

import { motion } from 'framer-motion';
import type { ConfigStep } from '@/stores/useConfiguratorStore';

const steps = [
  { id: 1 as ConfigStep, label: 'Dimensions' },
  { id: 2 as ConfigStep, label: 'Structure' },
  { id: 3 as ConfigStep, label: 'Openings' },
  { id: 4 as ConfigStep, label: 'Summary' },
];

interface StepIndicatorProps {
  currentStep: ConfigStep;
  onStepClick: (step: ConfigStep) => void;
}

export default function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between w-full relative">
      {/* Background connecting line */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 -z-10" />

      {steps.map((step, i) => {
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;

        return (
          <div key={step.id} className="flex items-center bg-white px-2">
            <button
              onClick={() => onStepClick(step.id)}
              className="flex items-center gap-2 group cursor-pointer"
            >
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                  ${isActive
                    ? 'bg-black text-white ring-2 ring-offset-2 ring-[var(--color-primary)]'
                    : isCompleted
                      ? 'bg-transparent text-black border-2 border-[var(--color-primary)]'
                      : 'bg-white text-gray-400 border-2 border-gray-200 group-hover:border-gray-400'
                  }
                `}
              >
                {isCompleted ? (
                  <svg className="w-3.5 h-3.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <span 
                className={`text-sm font-medium transition-colors ${
                  isActive ? 'text-black' : isCompleted ? 'text-gray-800' : 'text-gray-400 group-hover:text-gray-600'
                }`}
              >
                {step.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
