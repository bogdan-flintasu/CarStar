'use client';

import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

export default function AboutSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      id="despre-noi"
      ref={ref}
      className="relative flex items-center justify-center min-h-screen px-6 py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="max-w-3xl text-center"
      >
        <h2 className="text-sm uppercase tracking-[0.2em] text-[var(--color-primary)] font-semibold mb-4">
          Despre Noi
        </h2>

        <div className="w-12 h-0.5 bg-[var(--color-primary)] mx-auto mb-8" />

        <p className="text-2xl md:text-3xl lg:text-4xl text-[var(--color-text-primary)] leading-relaxed font-light">
          Cu peste{' '}
          <span className="font-semibold gradient-text">15 ani</span>{' '}
          de experiență în construcții metalice industriale, oferim soluții complete
          — de la proiectare și producție până la montaj și finisaje.
        </p>

        <p className="text-lg text-[var(--color-text-secondary)] mt-8 leading-relaxed">
          Fiecare hală este gândită pentru durabilitate, eficiență și estetică.
          Folosim materiale certificate și tehnici moderne pentru a livra
          proiecte care depășesc așteptările.
        </p>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
          className="grid grid-cols-3 gap-6 mt-16"
        >
          {[
            { number: '500+', label: 'Proiecte Finalizate' },
            { number: '15+', label: 'Ani Experiență' },
            { number: '98%', label: 'Clienți Mulțumiți' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card p-6">
              <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
                {stat.number}
              </div>
              <div className="text-sm text-[var(--color-text-muted)]">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
