import type { Metadata } from 'next';
import Link from 'next/link';
import { CC_BY_URL, RENDER_CREDITS } from '@/lib/renderCredits';

export const metadata: Metadata = { title: 'Credite modele 3D' };

/** Authors of the 3D models and pictures used in the quote renders (required by CC BY 4.0). */
export default function CreditsPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm font-bold text-[var(--color-primary)] hover:underline">
          ← Pagina principală
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Credite modele 3D</h1>
        <p className="mt-2 text-sm text-gray-600">
          Imaginile halelor sunt randări ale configurației. Decorul din jurul halei folosește următoarele modele și imagini.
        </p>
        <ul className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
          {RENDER_CREDITS.map((c) => (
            <li key={c.url} className="py-3 text-sm">
              <span className="font-bold">{c.what}:</span>{' '}
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline">
                „{c.title}”
              </a>{' '}
              de {c.author},{' '}
              {c.license === 'CC BY 4.0' ? (
                <a href={CC_BY_URL} target="_blank" rel="noopener noreferrer" className="underline">
                  CC BY 4.0
                </a>
              ) : (
                'CC0 (domeniu public)'
              )}
              . Modelul a fost redimensionat, comprimat și poziționat automat în scenă.
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
