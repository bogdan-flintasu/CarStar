import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CarStar — Configurator Hale Industriale',
  description: 'Configurator interactiv pentru hale industriale — ajustați înălțimea, lățimea și lungimea în timp real.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
