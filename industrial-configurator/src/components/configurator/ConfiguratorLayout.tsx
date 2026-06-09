'use client';

import { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import ConfigHeader from './ConfigHeader';
import ConfigFooter from './ConfigFooter';
import DimensionsStep from './steps/DimensionsStep';
import PanelsStep from './steps/PanelsStep';
import ClosingsStep from './steps/ClosingsStep';
import SummaryStep from './steps/SummaryStep';

export default function ConfiguratorLayout({ children }: { children: ReactNode }) {
  const { currentStep, setStep, length, width, height, getEstimatedPrice } = useConfiguratorStore();
  
  // Need to get openings to calculate price
  const { openings } = require('@/stores/useOpeningsStore').useOpeningsStore();
  const windowCount = openings.filter((o: any) => o.type === 'window').length;
  const doorCount = openings.filter((o: any) => o.type === 'door').length;
  const garageDoorCount = openings.filter((o: any) => o.type === 'garageDoor').length;
  const counts = { windows: windowCount, doors: doorCount, garageDoors: garageDoorCount };
  const estimatedPrice = getEstimatedPrice(counts);

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <DimensionsStep key="step-1" />;
      case 2:
        return <PanelsStep key="step-2" />;
      case 3:
        return <ClosingsStep key="step-3" />;
      case 4:
        return <SummaryStep key="step-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-[#F8F9FA] overflow-hidden">
      {/* Header */}
      <div className="shrink-0">
        <ConfigHeader currentStep={currentStep as any} onStepClick={setStep as any} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* 3D Canvas Area */}
        <div className="flex-1 relative">
          <div className="absolute inset-0">
            {children}
          </div>
        </div>

        {/* Sidebar Area */}
        <div className="w-[420px] shrink-0 bg-white shadow-xl z-10 flex flex-col h-full border-l border-gray-200 overflow-y-auto pt-[130px]">
          <div className="p-8">
            <h2 className="text-sm font-bold tracking-widest text-black mb-6 uppercase">
              Customize Building
            </h2>
            <AnimatePresence mode="wait">
              {renderStep()}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer */}
      <ConfigFooter 
        length={length} 
        width={width} 
        height={height} 
        estimatedPrice={estimatedPrice} 
      />
    </div>
  );
}
