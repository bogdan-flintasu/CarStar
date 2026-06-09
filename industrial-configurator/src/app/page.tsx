'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import HeroSection from '@/components/landing/HeroSection';
import AboutSection from '@/components/landing/AboutSection';
import WhyUsSection from '@/components/landing/WhyUsSection';
import ServicesSection from '@/components/landing/ServicesSection';
import CTASection from '@/components/landing/CTASection';

// Lazy-load the heavy 3D scene
const LandingScene = dynamic(() => import('@/components/landing/LandingScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--color-bg-primary)]" />
  ),
});

export default function LandingPage() {
  return (
    <div className="relative landing-theme">
      {/* Fixed 3D background */}
      <div className="fixed inset-0 z-0">
        <Suspense fallback={<div className="w-full h-full bg-[var(--color-bg-primary)]" />}>
          <LandingScene />
        </Suspense>
      </div>

      {/* Dark overlay for text readability */}
      <div className="fixed inset-0 z-[1] landing-overlay pointer-events-none" />

      {/* Fixed navigation header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/10 backdrop-blur-md border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-center">
          <div className="flex items-center gap-8">
            <a href="#despre-noi" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              Despre Noi
            </a>
            <a href="#de-ce-noi" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              De Ce Noi
            </a>
            <a href="#servicii" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              Servicii
            </a>
            <Link
              href="/configurator"
              className="px-5 py-2 rounded-full bg-[var(--color-primary)] text-black text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              Configurator
            </Link>
          </div>
        </nav>
      </header>

      {/* Scrollable content sections */}
      <main className="relative z-10">
        <HeroSection />
        <AboutSection />
        <WhyUsSection />
        <ServicesSection />
        <CTASection />

        {/* Footer */}
        <footer className="relative py-12 border-t border-[var(--color-border)]">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-text-muted)]">
                © {new Date().getFullYear()} CarStar. Toate drepturile rezervate.
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
              <a href="#" className="hover:text-[var(--color-text-primary)] transition-colors">
                Termeni
              </a>
              <a href="#" className="hover:text-[var(--color-text-primary)] transition-colors">
                Confidențialitate
              </a>
              <a href="#" className="hover:text-[var(--color-text-primary)] transition-colors">
                Contact
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
