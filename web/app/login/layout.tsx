import type { Metadata } from 'next';

// The page is a client component, so its metadata lives here. Own canonical (platform-only path, see
// proxy.ts); otherwise it inherits the homepage's canonical from the root layout.
export const metadata: Metadata = {
  title: 'Masuk Dashboard Travel | KlikUmroh.id',
  alternates: { canonical: 'https://klikumroh.id/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
