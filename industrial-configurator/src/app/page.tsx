'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [hasScrolled, setHasScrolled] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect mobile on mount
  useEffect(() => {
    // Set body background to dark to prevent white flash during mobile scroll jumping
    const originalBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#0a0b0d';

    const mobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsMobile(mobile);

    if (mobile) {
      // Mobile: skip 3D entirely, mark as ready immediately
      setModelReady(true);
    } else {
      // Desktop: start a 15s fallback timer — if 3D hasn't loaded, show the image
      fallbackTimer.current = setTimeout(() => {
        setUseFallback(true);
        setModelReady(true); // dismiss the loading spinner
      }, 15000);
    }

    return () => {
      document.body.style.backgroundColor = originalBackground;
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (window.scrollY > 10) {
      setHasScrolled(true);
      return;
    }
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setHasScrolled(true);
        window.removeEventListener('scroll', handleScroll);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleModelReady = useCallback(() => {
    // 3D loaded in time — cancel the fallback timer
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    setUseFallback(false);
    setModelReady(true);
  }, []);

  // Should we show the 3D canvas? Only on desktop when fallback hasn't kicked in
  const show3D = !isMobile && !useFallback;

  return (
    <div className="relative landing-theme" data-version="2">
      {/* Full-screen loading overlay — only on desktop while 3D loads */}
      <AnimatePresence>
        {!modelReady && (
          <motion.div
            key="landing-loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' }}
          >
            {/* Brand */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-12"
            >
              <span className="text-4xl font-extrabold tracking-tight select-none">
                <span className="text-white">Car</span>
                <span className="text-[#F5A623]">Star</span>
              </span>
            </motion.div>

            {/* Glowing spinner */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="relative w-20 h-20 mb-10"
            >
              {/* Outer glow ring */}
              <div
                className="absolute inset-0 rounded-full animate-spin"
                style={{
                  background: 'conic-gradient(from 0deg, transparent, #F5A623, transparent)',
                  filter: 'blur(4px)',
                }}
              />
              {/* Inner dark circle */}
              <div className="absolute inset-[6px] rounded-full bg-[#0a0a0a]" />
              {/* Spinning ring */}
              <div
                className="absolute inset-[3px] rounded-full animate-spin"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 70%, #F5A623)',
                  animationDuration: '1.2s',
                }}
              />
              <div className="absolute inset-[5px] rounded-full bg-[#0a0a0a]" />
            </motion.div>

            {/* Loading text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="text-gray-400 font-medium tracking-widest text-sm uppercase"
            >
              Se încarcă…
            </motion.p>

            {/* Subtle pulsing dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="flex gap-1.5 mt-4"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                  className="w-1.5 h-1.5 rounded-full bg-[#F5A623]"
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background layer */}
      {show3D ? (
        /* Desktop: Full 3D canvas */
        <div className="fixed top-0 left-0 w-full h-[120vh] z-0">
          <Suspense fallback={<div className="w-full h-full bg-[var(--color-bg-primary)]" />}>
            <LandingScene onReady={handleModelReady} />
          </Suspense>
        </div>
      ) : (
        /* Mobile OR Desktop fallback: Static image background */
        <div
          className="fixed top-0 left-0 w-full h-[120vh] z-0"
          style={{
            backgroundImage: 'url(/photos/image.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {/* Dark overlay for text readability */}
      <div className="fixed top-0 left-0 w-full h-[120vh] z-[1] landing-overlay pointer-events-none" />

      {/* Fixed navigation header */}
      <header className={`fixed top-0 left-0 right-0 z-50 bg-black/10 backdrop-blur-md border-b border-white/10 transition-all duration-500 ${
        hasScrolled ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      }`}>
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between relative">
          <div className="flex-shrink-0">
            <Link href="/" className="text-xl font-extrabold tracking-tight select-none">
              <span className="text-white">Car</span>
              <span className="text-[#F5A623]">Star</span>
            </Link>
          </div>
          
          {/* Desktop Nav Links - Centered */}
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-8">
            {[
              { href: '#despre-noi', label: 'Despre Noi' },
              { href: '#de-ce-noi', label: 'De Ce Noi' },
              { href: '#servicii', label: 'Servicii' },
            ].map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                initial={{ opacity: 0, y: -10 }}
                animate={hasScrolled ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
                transition={{ duration: 0.4, delay: 0.1 * i }}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors font-medium"
              >
                {link.label}
              </motion.a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={hasScrolled ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <Link
                href="/configurator"
                className="px-4 py-1.5 md:px-5 md:py-2 rounded-full bg-[var(--color-primary)] text-black text-xs md:text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                Configurator
              </Link>
            </motion.div>
            
            {/* Hamburger Menu Toggle */}
            <button 
              className="md:hidden text-white p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-white/10 overflow-hidden"
            >
              <div className="flex flex-col px-6 py-4 space-y-4 items-center text-center">
                {[
                  { href: '#despre-noi', label: 'Despre Noi' },
                  { href: '#de-ce-noi', label: 'De Ce Noi' },
                  { href: '#servicii', label: 'Servicii' },
                ].map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-[var(--color-text-secondary)] hover:text-white transition-colors text-lg font-medium"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
