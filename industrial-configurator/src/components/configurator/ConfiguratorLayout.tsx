'use client';

import { ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useConfiguratorStore, type ConfigStep } from '@/stores/useConfiguratorStore';
import { useShallow } from 'zustand/react/shallow';
import { selectHasOpeningConflicts, useOpeningsStore } from '@/stores/useOpeningsStore';
import { calculatePrice, countOpenings } from '@/lib/pricing';
import { surchargeRates } from '@/lib/colors';
import { getGraphicsSettings } from '@/lib/hardwareTier';
import AdminModelBar from './AdminModelBar';
import ViewToolbar from './ViewToolbar';
import HistoryButtons from './HistoryButtons';
import QualityToggle from './QualityToggle';
import MovedOpeningsToast from './MovedOpeningsToast';
import PlacementStatus from './PlacementStatus';
import ComponentInfoCard from './ComponentInfoCard';
import WalkOverlay from './WalkOverlay';
import { selectWalking, useWalkStore } from '@/stores/useWalkStore';
import ConfigHeader from './ConfigHeader';
import ConfigFooter from './ConfigFooter';
import DimensionsStep from './steps/DimensionsStep';
import PanelsStep from './steps/PanelsStep';
import ClosingsStep from './steps/ClosingsStep';
import SummaryStep from './steps/SummaryStep';

function readDismissed(): boolean {
  try {
    return !!sessionStorage.getItem('desktop-banner-dismissed');
  } catch {
    return false;
  }
}

export default function ConfiguratorLayout({ children }: { children: ReactNode }) {
  const currentStep = useConfiguratorStore((s) => s.currentStep);
  const setStep = useConfiguratorStore((s) => s.setStep);
  const hasOpeningConflicts = useOpeningsStore(selectHasOpeningConflicts);
  // Same rule as "Continuă": no jump past the openings step while an opening is red.
  const goToStep = (step: ConfigStep) => {
    if (step > 3 && hasOpeningConflicts) return;
    setStep(step);
  };
  const setPrices = useConfiguratorStore((s) => s.setPrices);
  const length = useConfiguratorStore((s) => s.length);
  const width = useConfiguratorStore((s) => s.width);
  const height = useConfiguratorStore((s) => s.height);
  const showFoundation = useConfiguratorStore((s) => s.showFoundation);
  const hasSandwichPanels = useConfiguratorStore((s) => s.hasSandwichPanels);
  const roofType = useConfiguratorStore((s) => s.roofType);
  const prices = useConfiguratorStore((s) => s.prices);
  const setPalette = useConfiguratorStore((s) => s.setPalette);
  const colors = useConfiguratorStore((s) => s.colors);
  const palette = useConfiguratorStore((s) => s.palette);
  // false on the server and during hydration, true afterwards (avoids persist hydration mismatch)
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);
  const walking = useWalkStore(selectWalking);
  // Walking on a phone: the whole screen for the view (the panel comes back with its own button afterwards).
  useEffect(
    () =>
      useWalkStore.subscribe((now, before) => {
        if (now.phase !== 'off' && before.phase === 'off') setIsMobilePanelOpen(false);
      }),
    [],
  );

  // Desktop recommendation banner (dismissible, per-session)
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Hidden while a placement tool is active: the 3D view needs the room.
  const placing = useOpeningsStore((s) => s.activeTool !== null);
  const showDesktopBanner = isMounted && !bannerDismissed && !placing && getGraphicsSettings().isMobile && !readDismissed();

  // Persisted state is rehydrated on the client only (skipHydration), so the shell renders on the server.
  useEffect(() => {
    void useConfiguratorStore.persist.rehydrate();
  }, []);

  // The configurator is a fixed app shell: the document itself must never scroll or rubber-band
  // (on phones, a swipe outside the panel would otherwise move the whole page).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('app-shell');
    return () => root.classList.remove('app-shell');
  }, []);

  // Each step starts at the top of the panel, wherever the previous step was scrolled to.
  const panelScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelScrollRef.current?.scrollTo({ top: 0 });
  }, [currentStep]);

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

  // The admin's colour catalogue; the built-in one is shown until it arrives.
  useEffect(() => {
    fetch('/api/colors')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setPalette(data);
      })
      .catch((err) => console.error('Failed to fetch colours:', err));
  }, [setPalette]);
  
  // Openings only matter for the price: subscribe to the counts, not the whole list
  const counts = useOpeningsStore(
    useShallow((s) => countOpenings(s.openings)),
  );
  const estimatedPrice = calculatePrice(
    { length, width, height, showFoundation, hasSandwichPanels, roofType },
    counts,
    prices,
    surchargeRates(colors, palette),
  );

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
    <div className="w-full h-[100dvh] flex flex-col bg-[var(--color-bg-primary)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0">
        <ConfigHeader currentStep={currentStep} onStepClick={goToStep} />
      </div>
      {/* Desktop recommendation banner for mobile */}
      {showDesktopBanner && (
        <div className="md:hidden shrink-0 bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-600 leading-snug">
            Pentru experiența completă, vă recomandăm să folosiți configuratorul pe un calculator sau laptop.
          </p>
          <button 
            onClick={() => {
              setBannerDismissed(true);
              sessionStorage.setItem('desktop-banner-dismissed', '1');
            }}
            className="shrink-0 text-gray-400 hover:text-gray-600 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {/* Mobile: canvas on top, panel below it (both in flow, so the canvas is never hidden behind the panel).
          Desktop: canvas left, panel right. */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">

        {/* 3D Canvas Area */}
        <div className="flex-1 min-h-0 relative touch-none">
          <div className="absolute inset-0">
            {children}
          </div>

          <WalkOverlay />
          {!walking && (
            <>
              <AdminModelBar />
              <ViewToolbar />
              <HistoryButtons />
              <QualityToggle />
              <MovedOpeningsToast />
              <PlacementStatus />
              <ComponentInfoCard />
            </>
          )}

          {/* Navigation Hint Overlay — Desktop (bottom-left) */}
          <div className={`${walking ? 'hidden' : 'hidden md:flex'} absolute bottom-6 left-6 max-w-[calc(100%-3rem)] bg-white/90 backdrop-blur-md px-4 py-3 rounded-xl border border-gray-200 shadow-sm pointer-events-none z-10 flex-col gap-1.5`}>
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
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded-md text-gray-700 shadow-sm font-sans">0–5</kbd>
                Vederi
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded-md text-gray-700 shadow-sm font-sans">P</kbd>
                Proiecție
              </span>
              {currentStep === 3 && (
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded-md text-gray-700 shadow-sm font-sans">Alt/⌥</kbd>
                  Fără aliniere
                </span>
              )}
            </div>
          </div>

          {/* Navigation Hint Overlay — Mobile (top-right, hidden when panel is open; the view toolbar is at the bottom) */}
          {!isMobilePanelOpen && !walking && (
            <div className="md:hidden absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-2 rounded-xl border border-gray-200 shadow-sm pointer-events-none z-10 flex flex-col gap-1">
              <span className="text-[9px] font-bold text-gray-800 uppercase tracking-wider">Control 3D</span>
              <div className="flex gap-3 text-[11px] font-medium text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="text-sm leading-none">☝️</span> Rotește
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-sm leading-none">✌️</span> Mișcă
                </span>
              </div>
            </div>
          )}

          {/* Mobile Toggle Button (only visible on small screens when panel is closed) */}
          {!isMobilePanelOpen && !walking && (
            <button
              onClick={() => setIsMobilePanelOpen(true)}
              className="md:hidden absolute bottom-16 left-1/2 -translate-x-1/2 bg-[var(--color-primary)] text-[var(--ui-accent-text)] font-bold px-6 py-3 rounded-full shadow-lg z-20 flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Personalizează Hala
            </button>
          )}
        </div>

        {/* Sidebar Area (Bottom Sheet on Mobile) */}
        <div
          className={`
            relative w-full md:w-[420px]
            ${isMobilePanelOpen ? 'h-[46dvh]' : 'h-0'} md:h-full
            shrink-0 overflow-hidden bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-xl z-30
            flex flex-col md:border-l border-gray-200
            transition-[height] duration-300 ease-in-out
            rounded-t-3xl md:rounded-none
          `}
        >
          <div
            ref={panelScrollRef}
            className="flex-1 min-h-0 px-5 pb-8 pt-3 md:p-8 md:pt-[130px] overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar"
          >
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
