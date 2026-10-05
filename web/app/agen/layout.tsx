import type { Metadata } from 'next';

// The agent portal (login, sign-up, dashboard...) is not content for search engines, and must not inherit
// the travel home page's canonical from the root layout (that would point every /agen page at "/").
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function AgentPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
