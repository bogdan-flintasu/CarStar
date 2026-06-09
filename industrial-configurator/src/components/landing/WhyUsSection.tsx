'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const features = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Calitate Certificată',
    description:
      'Materiale premium cu certificări europene. Fiecare componentă este testată și verificată pentru a garanta siguranța și rezistența structurii.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Livrare Rapidă',
    description:
      'Proces optimizat de producție și montaj. Respectăm termenele promise și livrăm proiecte complete în timp record.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Prețuri Transparente',
    description:
      'Configuratorul nostru 3D îți oferă un preț estimat în timp real. Fără costuri ascunse, fără surprize la finalizare.',
  },
];

export default function WhyUsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      id="de-ce-noi"
      ref={ref}
      className="relative flex flex-col items-center justify-center min-h-screen px-6 py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h2 className="text-sm uppercase tracking-[0.2em] text-[var(--color-primary)] font-semibold mb-4">
          De Ce Noi?
        </h2>
        <div className="w-12 h-0.5 bg-[var(--color-primary)] mx-auto mb-6" />
        <p className="text-3xl md:text-4xl font-bold text-[var(--color-text-primary)]">
          Excelență în fiecare detaliu
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15 * i }}
            className="glass-card p-8 group hover:border-[var(--color-border-active)] transition-all duration-300 hover:-translate-y-1"
          >
            <div className="w-14 h-14 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center text-[var(--color-primary)] mb-6 group-hover:scale-110 transition-transform duration-300">
              {feature.icon}
            </div>
            <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mb-3">
              {feature.title}
            </h3>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
