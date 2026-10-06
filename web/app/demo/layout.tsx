import type { Metadata } from 'next';

// /demo only signs in to the demo travel and redirects: keep it out of search, with no canonical of its
// own (it would otherwise inherit the homepage's canonical from the root layout).
export const metadata: Metadata = {
  title: 'Membuka Demo | KlikUmroh.id',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
