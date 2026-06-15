'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import ConfigHeader from './ConfigHeader';
import ConfigFooter from './ConfigFooter';
import DimensionsStep from './steps/DimensionsStep';
import PanelsStep from './steps/PanelsStep';
import ClosingsStep from './steps/ClosingsStep';
import SummaryStep from './steps/SummaryStep';

export default function ConfiguratorLayout({ children }: { children: ReactNode }) {
  const { currentStep, setStep, length, width, height, getEstimatedPrice, setPrices } = useConfiguratorStore();
  const [isMounted, setIsMounted] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch prices from DB on mount
  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setPrices({
            structurePerM3: data.structurePerM3,
            foundationPerM2: data.foundationPerM2,
            sandwichPerM2: data.sandwichPerM2,
            windowPerUnit: data.windowPerUnit,
            doorPerUnit: data.doorPerUnit,
            bigDoorPerUnit: data.bigDoorPerUnit,
          });
        }
      })
      .catch((err) => console.error('Failed to fetch prices:', err));
  }, [setPrices]);
  
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

  if (!isMounted) {
    // Prevent hydration mismatch by rendering a blank/loading screen on the server
    return <div className="w-full h-screen bg-[#F8F9FA]" />;
  }

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
          
          {/* Navigation Hint Overlay */}
          <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-md px-4 py-3 rounded-xl border border-gray-200 shadow-sm pointer-events-none z-10 flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-800 uppercase tracking-wider mb-0.5">Control 3D</span>
            <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded-md text-gray-700 shadow-sm font-sans">Click Stânga</kbd> 
                Rotește
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded-md text-gray-700 shadow-sm font-sans">Click Dreapta</kbd> 
                Mișcă
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded-md text-gray-700 shadow-sm font-sans">Scroll</kbd> 
                Zoom
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Toggle Button (only visible on small screens when panel is closed) */}
        {!isMobilePanelOpen && (
          <button
            onClick={() => setIsMobilePanelOpen(true)}
            className="md:hidden absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#F5A623] text-black font-bold px-6 py-3 rounded-full shadow-lg z-20 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            Personalizează Hala
          </button>
        )}

        {/* Sidebar Area (Bottom Sheet on Mobile) */}
        <div 
          className={`
            fixed md:relative bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto
            w-full md:w-[420px] 
            ${isMobilePanelOpen ? 'h-[60vh]' : 'h-0 overflow-hidden'} md:h-full 
            shrink-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-xl z-30 
            flex flex-col border-t md:border-t-0 md:border-l border-gray-200 
            transition-all duration-300 ease-in-out
            rounded-t-3xl md:rounded-none
          `}
        >
          <div className="p-6 pb-24 md:p-8 overflow-y-auto h-full pt-4 md:pt-[130px] no-scrollbar">
            {/* Mobile close button / drag handle area */}
            <div 
              className="md:hidden flex justify-center pb-4 cursor-pointer"
              onClick={() => setIsMobilePanelOpen(false)}
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </div>

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold tracking-widest text-black uppercase">
              Personalizează Hala
              </h2>
              <button 
                className="md:hidden text-gray-400 hover:text-black"
                onClick={() => setIsMobilePanelOpen(false)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
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
