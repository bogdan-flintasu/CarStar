'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';

export default function SummaryStep() {
  const {
    length, width, height,
    showFoundation, hasSandwichPanels,
    isIsolated, insulation,
    getFloorArea, getNumberOfBays, getEstimatedPrice, getConfigurationData,
    prevStep,
  } = useConfiguratorStore();

  const openings = useOpeningsStore((s) => s.openings);

  const windowCount = openings.filter((o) => o.type === 'window').length;
  const doorCount = openings.filter((o) => o.type === 'door').length;
  const garageDoorCount = openings.filter((o) => o.type === 'garageDoor').length;

  const counts = { windows: windowCount, doors: doorCount, garageDoors: garageDoorCount };
  const estimatedPrice = getEstimatedPrice(counts);
  const floorArea = getFloorArea();
  const numberOfBays = getNumberOfBays();

  // ── Contact form state ──────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [configLink, setConfigLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerateLink = async () => {
    try {
      const data = { ...getConfigurationData(counts), openingsList: openings };
      const res = await fetch('/api/configurations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = await res.json();
      if (result.token) {
        const url = `${window.location.origin}/configuration/${result.token}`;
        setConfigLink(url);
      }
    } catch (err) {
      console.error('Failed to generate configuration link:', err);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(configLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitEmail = async () => {
    if (!email) return;
    setSending(true);

    try {
      let link = configLink;
      if (!link) {
        const data = { ...getConfigurationData(counts), openingsList: openings };
        const res = await fetch('/api/configurations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, userName: name, userEmail: email, userPhone: phone }),
        });
        const result = await res.json();
        if (result.token) {
          link = `${window.location.origin}/configuration/${result.token}`;
          setConfigLink(link);
        }
      }

      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          message,
          configurationLink: link,
          configurationSummary: getConfigurationData(counts),
        }),
      });

      setSent(true);
    } catch (err) {
      console.error('Failed to send email:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-bold text-black uppercase mb-1">Sumar</h3>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
        {/* Price highlight */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center shadow-sm">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-bold">
            Preț Estimativ
          </div>
          <div className="text-3xl font-bold text-black">
            €{estimatedPrice.toLocaleString('en-US')}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            *Preț orientativ, supus modificărilor
          </div>
        </div>

        {/* Configuration details */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2.5 shadow-sm">
          <h3 className="text-sm font-bold text-black mb-3 uppercase">Detalii</h3>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Dimensiuni</span>
            <span className="text-black font-bold">{length} × {width} × {height} m</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Suprafață la sol</span>
            <span className="text-black font-bold">{floorArea} m²</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Număr de travee</span>
            <span className="text-black font-bold">{numberOfBays}</span>
          </div>

          <div className="h-px bg-gray-100 my-1" />

          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Fundație</span>
            <span className={`font-bold ${showFoundation ? 'text-green-600' : 'text-gray-400'}`}>
              {showFoundation ? 'DA' : 'NU'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Panouri sandwich</span>
            <span className={`font-bold ${hasSandwichPanels ? 'text-green-600' : 'text-gray-400'}`}>
              {hasSandwichPanels ? 'DA' : 'NU'}
            </span>
          </div>
          {isIsolated && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-medium">Izolație</span>
              <span className="text-black font-bold">{insulation} mm</span>
            </div>
          )}

          <div className="h-px bg-gray-100 my-1" />

          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Geamuri</span>
            <span className="text-black font-bold">{windowCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Uși</span>
            <span className="text-black font-bold">{doorCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Uși industriale</span>
            <span className="text-black font-bold">{garageDoorCount}</span>
          </div>
        </div>

        {/* Generate link */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-bold text-black mb-3">Partajează Configurația</h3>
          {configLink ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={configLink}
                readOnly
                className="flex-1 py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 truncate outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-xs font-bold cursor-pointer hover:bg-orange-600 transition-colors shrink-0"
              >
                {copied ? '✓' : 'Copiază'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateLink}
              className="w-full py-2 rounded-lg border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-bold cursor-pointer hover:bg-orange-55 transition-colors"
            >
              Generează Link
            </button>
          )}
        </div>

        {/* Email form */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-bold text-black mb-3">Cere Ofertă</h3>

          {sent ? (
            <div className="text-center py-6 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-bold text-green-600">Cererea a fost trimisă cu succes!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <input
                type="text"
                placeholder="Nume"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-gray-300 focus:border-[var(--color-primary)] outline-none text-black rounded-lg text-sm transition-colors placeholder:text-gray-400"
              />
              <input
                type="email"
                placeholder="Email *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-gray-300 focus:border-[var(--color-primary)] outline-none text-black rounded-lg text-sm transition-colors placeholder:text-gray-400"
                required
              />
              <input
                type="tel"
                placeholder="Telefon"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-gray-300 focus:border-[var(--color-primary)] outline-none text-black rounded-lg text-sm transition-colors placeholder:text-gray-400"
              />
              <textarea
                placeholder="Mesaj (opțional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="w-full py-2 px-3 bg-white border border-gray-300 focus:border-[var(--color-primary)] outline-none text-black rounded-lg text-sm transition-colors resize-none placeholder:text-gray-400"
              />
              <button
                onClick={handleSubmitEmail}
                disabled={!email || sending}
                className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white font-bold text-sm hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {sending ? 'Se trimite...' : 'Trimite Cererea'}
              </button>
            </div>
          )}
        </div>
      </div>

    </motion.div>
  );
}
