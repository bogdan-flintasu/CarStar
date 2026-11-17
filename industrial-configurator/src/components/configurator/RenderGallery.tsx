'use client';

/**
 * Thumbnails of the hall's quote pictures; a click opens the picture full size (arrows / Esc on a keyboard,
 * buttons on a phone), in a portal so no transformed parent can trap it. Used in the summary step and on the public configuration page.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RENDER_VIEW_LABELS, RENDER_VIEWS, type RenderView } from '@/lib/hall/renderViews';

export interface GalleryImage {
  view: RenderView;
  url: string;
  width: number;
  height: number;
}

interface RenderGalleryProps {
  images: readonly GalleryImage[];
  /** Pictures are being made: shows placeholders (with `done` of them finished). */
  loading?: boolean;
  done?: number;
  error?: boolean;
  onRetry?: () => void;
  /** Light text on a dark page. */
  dark?: boolean;
}

export default function RenderGallery({ images, loading, done = 0, error, onRetry, dark }: RenderGalleryProps) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (by: number) => setOpen((i) => (i === null ? i : (i + by + images.length) % images.length)),
    [images.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, step]);

  const muted = dark ? 'text-gray-400' : 'text-gray-500';

  if (error && !loading) {
    return (
      <div className={`text-xs ${muted} flex items-center justify-between gap-2`}>
        <span>Imaginile nu au putut fi generate.</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-bold text-[var(--color-primary)] cursor-pointer hover:underline">
            Reîncearcă
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-2 gap-2" aria-hidden>
          {RENDER_VIEWS.map((view) => (
            <div key={view} className={`aspect-[16/10] rounded-md animate-pulse ${dark ? 'bg-white/10' : 'bg-gray-100'}`} />
          ))}
        </div>
        <p role="status" className={`mt-2 text-xs ${muted}`}>
          Se generează imaginile halei… {done}/{RENDER_VIEWS.length}
          <span className="block mt-0.5">Poate dura câteva secunde, mai ales pe telefon.</span>
        </p>
      </div>
    );
  }

  if (images.length === 0) return null;
  const current = open === null ? null : images[open];

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {images.map((image, i) => (
          <button
            key={image.view}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative block overflow-hidden rounded-md border border-gray-200 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-label={`Mărește: ${RENDER_VIEW_LABELS[image.view]}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- object URLs and API images, no optimisation needed */}
            <img
              src={image.url}
              alt={RENDER_VIEW_LABELS[image.view]}
              width={image.width}
              height={image.height}
              className="block w-full h-auto aspect-[16/10] object-cover transition-transform group-hover:scale-[1.03]"
            />
            <span className="absolute left-1 bottom-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {RENDER_VIEW_LABELS[image.view]}
            </span>
          </button>
        ))}
      </div>

      {current &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={RENDER_VIEW_LABELS[current.view]}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-4"
          onClick={close}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src={current.url}
            alt={RENDER_VIEW_LABELS[current.view]}
            width={current.width}
            height={current.height}
            className="max-h-[80vh] max-w-full h-auto w-auto rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-4 flex items-center gap-3 text-white" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => step(-1)} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20 cursor-pointer" aria-label="Imaginea anterioară">
              ‹
            </button>
            <span className="min-w-36 text-center text-sm font-semibold">
              {RENDER_VIEW_LABELS[current.view]} · {open! + 1}/{images.length}
            </span>
            <button type="button" onClick={() => step(1)} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20 cursor-pointer" aria-label="Imaginea următoare">
              ›
            </button>
            <button type="button" onClick={close} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20 cursor-pointer">
              Închide
            </button>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
