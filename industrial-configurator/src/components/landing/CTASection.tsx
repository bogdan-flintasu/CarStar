'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import Link from 'next/link';

export default function CTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      id="cta"
      ref={ref}
      className="relative flex flex-col items-center justify-center min-h-[70vh] px-6 py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="text-center max-w-2xl"
      >
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[var(--color-text-primary)] mb-6 leading-tight">
          Configurează-ți
          <br />
          <span className="gradient-text">hala acum</span>
        </h2>

        <p className="text-lg text-[var(--color-text-secondary)] mb-12 leading-relaxed">
          Folosește configuratorul nostru 3D interactiv pentru a-ți proiecta hala ideală.
          Ajustează dimensiunile, alege materialele și obține un preț estimat instant.
        </p>

        <Link href="/configurator">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            className="group relative inline-flex items-center gap-3 px-10 py-5 rounded-full bg-[var(--color-primary)] text-black font-bold text-lg transition-all hover:bg-[var(--color-primary-hover)] cursor-pointer animate-pulse-glow"
          >
            Deschide Configuratorul
            <svg
              className="w-5 h-5 transition-transform group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </motion.button>
        </Link>

        <p className="text-sm text-[var(--color-text-muted)] mt-6">
          Gratuit • Fără cont • Rezultate în timp real
        </p>
      </motion.div>
    </section>
  );
}
