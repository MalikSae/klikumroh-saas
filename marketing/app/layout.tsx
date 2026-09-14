import type { Metadata } from 'next';
import { Nunito, Roboto } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  variable: '--mkt-font-heading',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const roboto = Roboto({
  variable: '--mkt-font-body',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KlikUmroh.id — Sistem Agen & Affiliate Umroh Whitelabel',
  description:
    'Beri agen link referral, dashboard, materi promosi, target, dan pencatatan jamaah yang bisa dipantau oleh tim travel. Semuanya berjalan dengan brand travel Anda sendiri.',
};

import { PlatformSettingsProvider } from '../context/PlatformSettingsContext';
import { WhatsAppFloatingWidget } from '../components/WhatsAppFloatingWidget';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${nunito.variable} ${roboto.variable}`}>
      <body>
        <PlatformSettingsProvider>
          {children}
          <WhatsAppFloatingWidget />
        </PlatformSettingsProvider>
      </body>
    </html>
  );
}
