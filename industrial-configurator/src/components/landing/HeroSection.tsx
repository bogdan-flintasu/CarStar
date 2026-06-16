'use client';

import { motion } from 'framer-motion';

export default function HeroSection() {
  const scrollDown = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };

  return (
    <section
      id="hero"
      className="relative flex flex-col items-center justify-center min-h-screen text-center px-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
        className="max-w-4xl"
      >

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6">
          <span className="text-[var(--color-text-primary)]">Hale Industriale</span>
          <br />
          <span className="gradient-text">la Cheie</span>
        </h1>

        <p className="text-lg md:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-12 leading-relaxed">
          Proiectăm și construim hale metalice personalizate, adaptate nevoilor tale.
          De la concept la realitate, cu precizie și profesionalism.
        </p>

        <motion.button
          onClick={scrollDown}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          className="group inline-flex items-center gap-3 px-4 py-3 rounded-full bg-[var(--color-primary)] text-black font-semibold text-lg transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-[0_0_32px_var(--color-primary-glow)] cursor-pointer"
        >
          Descoperă Mai Mult
          <svg
            className="w-5 h-5 transition-transform group-hover:translate-y-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </motion.button>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        className="hidden md:block absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center">
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-1.5 h-1.5 mt-2 rounded-full bg-[var(--color-primary)]"
          />
        </div>
      </motion.div>
    </section>
  );
}
