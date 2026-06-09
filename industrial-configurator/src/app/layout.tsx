import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: {
    default: 'CarStar — Hale Industriale la Cheie',
    template: '%s | CarStar',
  },
  description:
    'Proiectăm și construim hale metalice personalizate. Configurator 3D interactiv pentru hale industriale — ajustați dimensiunile, închiderile și obțineți un preț estimat în timp real.',
  keywords: [
    'hale industriale',
    'hale metalice',
    'configurator hale',
    'construcții metalice',
    'hale la cheie',
    'panouri sandwich',
    'depozite metalice',
  ],
  openGraph: {
    title: 'CarStar — Hale Industriale la Cheie',
    description:
      'Configurator 3D interactiv pentru hale industriale. Proiectare, producție și montaj.',
    type: 'website',
    locale: 'ro_RO',
    siteName: 'CarStar',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={outfit.variable}>
      <body className={outfit.className}>{children}</body>
    </html>
  );
}

