// Ribbon on every page of the demo travel (demo.klikumroh.id): the site, its licence number and its
// people are made up, so visitors must never take it for a real travel. Rendered by the root layout only
// when tenant-info says is_demo.
import React from 'react';
import { Info } from 'lucide-react';

// The KlikUmroh landing page for this environment: production, or the local dev server when the demo
// runs on a local host (demo.localhost:3000), so testing locally never jumps to the live site.
const platformUrl = (host: string): string => {
  const [hostname, port] = host.toLowerCase().split(':');
  const local =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local');
  return local ? `http://localhost${port ? `:${port}` : ''}` : 'https://klikumroh.id';
};

export const DemoRibbon: React.FC<{ host: string }> = ({ host }) => (
  <div className="tw-demo-ribbon" role="note">
    <Info size={14} aria-hidden="true" />
    <span>
      Website demo KlikUmroh.{' '}
      <a href={platformUrl(host)} className="tw-demo-ribbon__link">
        Buat milik Anda
      </a>
    </span>
  </div>
);
