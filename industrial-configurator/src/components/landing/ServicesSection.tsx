'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const services = [
  {
    label: 'Hale de producție',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Hale de depozitare',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    label: 'Hale agricole',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v18M5 12h14M12 3c4 0 7 3 7 7 0 4-3 7-7 7S5 14 5 10c0-4 3-7 7-7z" />
      </svg>
    ),
  },
  {
    label: 'Hale comerciale',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    label: 'Panouri sandwich',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    label: 'Fundații',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 12h16M12 4v16" />
      </svg>
    ),
  },
  {
    label: 'Închideri personalizate',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Acoperișuri metalice',
    icon: (
      <svg className="w-8 h-8 mx-auto text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" />
      </svg>
    ),
  },
];

export default function ServicesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      id="servicii"
      ref={ref}
      className="relative flex flex-col items-center justify-center min-h-screen px-6 py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="text-center mb-16 max-w-2xl"
      >
        <h2 className="text-sm uppercase tracking-[0.2em] text-[var(--color-primary)] font-semibold mb-4">
          Serviciile Noastre
        </h2>
        <div className="w-12 h-0.5 bg-[var(--color-primary)] mx-auto mb-6" />
        <p className="text-3xl md:text-4xl font-bold text-[var(--color-text-primary)] mb-4">
          Soluții complete pentru orice nevoie
        </p>
        <p className="text-[var(--color-text-secondary)] text-lg">
          De la hale de producție și depozitare până la spații agricole și comerciale,
          oferim o gamă completă de soluții în construcții metalice.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full">
        {services.map((service, i) => (
          <motion.div
            key={service.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.4, delay: 0.08 * i }}
            className="glass-card p-5 text-center group hover:border-[var(--color-border-active)] transition-all duration-300 cursor-default"
          >
            <div className="mb-4 text-[var(--color-primary)] group-hover:scale-110 transition-transform duration-300">
              {service.icon}
            </div>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {service.label}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
