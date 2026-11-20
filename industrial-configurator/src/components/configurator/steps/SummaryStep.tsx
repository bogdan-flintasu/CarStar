'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { countOpenings } from '@/lib/pricing';
import { COLOR_COMPONENTS, COMPONENT_LABELS } from '@/lib/colors';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import RenderGallery from '../RenderGallery';
import { ensureHallRenders, useHallRenders, type RenderedView } from '../hallRenders';
import { renderField } from '@/lib/validation/renders';

export default function SummaryStep() {
  const {
    length, width, height,
    showFoundation, hasSandwichPanels,
    isIsolated, insulation, colors, roofType, highSide, model,
    getFloorArea, getNumberOfBays, getEstimatedPrice, getConfigurationData,
  } = useConfiguratorStore(useShallow((s) => ({
    length: s.length, width: s.width, height: s.height,
    showFoundation: s.showFoundation, hasSandwichPanels: s.hasSandwichPanels,
    isIsolated: s.isIsolated, insulation: s.insulation, colors: s.colors,
    roofType: s.roofType, highSide: s.highSide, model: s.model,
    getFloorArea: s.getFloorArea, getNumberOfBays: s.getNumberOfBays,
    getEstimatedPrice: s.getEstimatedPrice, getConfigurationData: s.getConfigurationData,
  })));

  const openings = useOpeningsStore((s) => s.openings);
  const renders = useHallRenders();

  const counts = countOpenings(openings);
  const { windows: windowCount, doors: doorCount, garageDoors: garageDoorCount } = counts;
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
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState('');
  const [configLink, setConfigLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

  /**
   * Saves the configuration once, with its pictures (multipart upload), and returns its token. Pictures that could not
   * be rendered are left out rather than blocking the save. Throws the HTTP status on failure.
   */
  const saveConfiguration = async (contact?: { userName: string; userEmail: string; userPhone: string }) => {
    if (token) return token;
    let views: RenderedView[] = [];
    try {
      views = await ensureHallRenders();
    } catch (err) {
      console.error('Saving without pictures:', err);
    }
    const form = new FormData();
    form.append('payload', JSON.stringify({ data: { ...getConfigurationData(counts), openingsList: openings }, ...contact }));
    for (const v of views) form.append(renderField(v.view), v.blob, `${v.view}.jpg`);
    const res = await fetch('/api/configurations', { method: 'POST', body: form });
    if (!res.ok) throw res.status;
    const result: { token?: string } = await res.json();
    if (!result.token) throw 0;
    setToken(result.token);
    setConfigLink(`${window.location.origin}/configuration/${result.token}`);
    return result.token;
  };

  const handleGenerateLink = async () => {
    setSaving(true);
    try {
      await saveConfiguration();
    } catch (err) {
      console.error('Failed to generate configuration link:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    setPdfError('');
    try {
      const saved = await saveConfiguration();
      const res = await fetch(`/api/configurations/${saved}/pdf`);
      if (!res.ok) throw res.status;
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `oferta-hala-${saved}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('Failed to download the PDF quote:', err);
      setPdfError(errorFor(typeof err === 'number' ? err : 0));
    } finally {
      setPdfBusy(false);
    }
  };

  const errorFor = (status: number) =>
    status === 429
      ? 'Prea multe cereri. Încercați din nou peste câteva minute.'
      : status === 400
        ? 'Datele introduse nu sunt valide. Verificați câmpurile și încercați din nou.'
        : 'A apărut o eroare. Încercați din nou.';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(configLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitEmail = async () => {
    if (!email) return;
    setSending(true);
    setError('');

    try {
      let link = configLink;
      if (!link) {
        try {
          const saved = await saveConfiguration({ userName: name, userEmail: email, userPhone: phone });
          link = `${window.location.origin}/configuration/${saved}`;
        } catch (status) {
          setError(errorFor(typeof status === 'number' ? status : 0));
          return;
        }
      }

      const mailRes = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          message,
          website: honeypot,
          configurationLink: link,
          configurationSummary: getConfigurationData(counts),
        }),
      });

      if (!mailRes.ok) {
        setError(errorFor(mailRes.status));
        return;
      }
      setSent(true);
    } catch (err) {
      console.error('Failed to send email:', err);
      setError(errorFor(0));
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
      className="flex flex-col"
    >
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-bold text-black uppercase mb-1">Sumar</h3>
      </div>

      <div className="space-y-3 flex-1">
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

        {/* Pictures of the hall, as in the PDF quote */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-bold text-black mb-3 uppercase">Imagini</h3>
          <RenderGallery
            images={renders.status === 'ready' ? renders.views : []}
            loading={renders.status === 'rendering' || renders.status === 'idle'}
            done={renders.done}
            error={renders.status === 'error'}
            onRetry={renders.retry}
          />
        </div>

        {/* Configuration details */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2.5 shadow-sm">
          <h3 className="text-sm font-bold text-black mb-3 uppercase">Detalii</h3>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Dimensiuni</span>
            <span className="text-black font-bold">{length} × {width} × {height} m</span>
          </div>
          {model && (
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-gray-600 font-medium">Pornit de la</span>
              <span className="text-black font-bold text-right">{model.name}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Acoperiș</span>
            <span className="text-black font-bold">
              {roofType === 'mono' ? `O apă (înalt ${highSide === 'left' ? 'stânga' : 'dreapta'})` : '2 ape'}
            </span>
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

          {COLOR_COMPONENTS.map((c) => (
            <div key={c} className="flex justify-between items-center gap-3 text-sm">
              <span className="text-gray-600 font-medium">{COMPONENT_LABELS[c]}</span>
              <span className="flex items-center gap-2 text-black font-bold text-right">
                {colors[c].name}
                <span
                  aria-hidden
                  className="inline-block w-3.5 h-3.5 rounded-full border border-gray-300"
                  style={{ backgroundColor: colors[c].hex }}
                />
              </span>
            </div>
          ))}

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
                className="px-3 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--ui-accent-text)] text-xs font-bold cursor-pointer hover:bg-[var(--color-primary-hover)] transition-colors shrink-0"
              >
                {copied ? '✓' : 'Copiază'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateLink}
              disabled={saving}
              className="w-full py-2 rounded-lg border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-bold cursor-pointer transition-colors disabled:opacity-50"
            >
              {saving ? 'Se salvează…' : 'Generează Link'}
            </button>
          )}
        </div>

        {/* PDF quote, built on the server from the saved configuration */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-bold text-black mb-1">Ofertă PDF</h3>
          <p className="text-xs text-gray-500 mb-3">Imaginile halei, specificațiile și prețul estimativ, într-un singur document.</p>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfBusy}
            className="w-full py-2.5 rounded-lg bg-black text-white text-sm font-bold cursor-pointer hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {pdfBusy ? 'Se pregătește oferta…' : 'Descarcă oferta PDF'}
          </button>
          {pdfError && <p role="alert" className="mt-2 text-xs text-red-500">{pdfError}</p>}
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
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
              {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleSubmitEmail}
                disabled={!email || sending}
                className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-[var(--ui-accent-text)] font-bold text-sm hover:bg-[var(--color-primary-hover)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
