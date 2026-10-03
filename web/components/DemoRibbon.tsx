// Ribbon on every page of the demo travel (demo.klikumroh.id): the site, its licence number and its
// people are made up, so visitors must never take it for a real travel. Rendered by the root layout only
// when tenant-info says is_demo.
import React from 'react';
import { Info } from 'lucide-react';

export const DemoRibbon: React.FC = () => (
  <div className="tw-demo-ribbon" role="note">
    <Info size={14} aria-hidden="true" />
    <span>
      Website demo KlikUmroh, bukan travel sungguhan. Data direset tiap malam.{' '}
      <a href="https://klikumroh.id" className="tw-demo-ribbon__link">
        Buat website travel Anda
      </a>
    </span>
  </div>
);
