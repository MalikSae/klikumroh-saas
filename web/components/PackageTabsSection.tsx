'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { PackageCard } from './PackageCard';

import { Button } from './Button';
import type { PublicPackage } from './PublicCatalog';
import { selectHomePackages, type PackageOrder } from './home-package-selection';
import './PackageTabsSection.css';

export interface PackageTabsSectionProps {
  packages: PublicPackage[];
  onSelectPackage: (pkg: PublicPackage) => void;
}

export const PackageTabsSection: React.FC<PackageTabsSectionProps> = ({ packages, onSelectPackage }) => {
  const [order, setOrder] = useState<PackageOrder>('default');
  const displayedPackages = selectHomePackages(packages, '', '', order);
  const filtered = false;
  const reset = () => { setOrder('default'); };

  // Grid 2 x 3 (maksimal 6 paket).
  // Jika ada 5 paket, tampilkan 4 (2 x 2) agar layout grid tetap penuh dan proporsional.
  const getProportionalLimit = (total: number): number => {
    if (total >= 6) return 6;
    if (total >= 4) return 4;
    if (total >= 2) return 2;
    return total;
  };

  const visiblePackages = displayedPackages.slice(0, getProportionalLimit(displayedPackages.length));

  return (
    <section id="pilihan-paket" className="tw-pkg-tabs-section" aria-labelledby="home-title">
      <div className="tw-pkg-tabs-section__header">
        <h2 id="home-title" className="tw-pkg-tabs-section__title">
          {filtered ? 'Hasil pencarian' : 'Jelajahi Paket Umroh'}
        </h2>
        {filtered && (
          <div className="tw-pkg-tabs-section__meta">
            <button className="tw-home-reset" type="button" onClick={reset}>Reset</button>
          </div>
        )}
      </div>
      <div className="tw-home-sort" role="tablist" aria-label="Pilihan paket umroh">
        {([
          ['default', `Semua (${displayedPackages.length})`],
          ['departure', 'Jadwal Terdekat'],
          ['price', 'Harga Terendah'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            className="tw-home-sort__option"
            aria-selected={order === value}
            aria-pressed={order === value}
            onClick={() => setOrder(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {displayedPackages.length === 0 ? (
        <div className="tw-pkg-tabs-section__empty">
          <Search className="tw-home-icon" aria-hidden="true" />
          <h3>{packages.length ? 'Paket belum ditemukan' : 'Jadwal sedang disiapkan'}</h3>
          <p>{packages.length ? 'Coba nama paket lain atau pilih semua keberangkatan.' : 'Hubungi tim travel untuk informasi keberangkatan berikutnya.'}</p>
          {filtered && <Button variant="secondary" onClick={reset}>Tampilkan semua paket</Button>}
        </div>
      ) : (
        <div className="tw-pkg-tabs-section__list">
          {visiblePackages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              id={pkg.id}
              name={pkg.name}
              price={pkg.price || undefined}
              departureDateRaw={pkg.departure_date}
              quota={pkg.quota ?? undefined}
              badge={pkg.quota !== null && pkg.quota !== undefined ? `Sisa ${pkg.quota} Kursi` : undefined}
              imageUrl={pkg.photos?.[0]?.file_path}
              onSelect={() => onSelectPackage(pkg)}
              className="tw-package-card--ota"
            />
          ))}
        </div>
      )}
      <Link href="/paket" className="tw-home-all-packages">Lihat katalog lengkap <ArrowRight className="tw-home-icon" aria-hidden="true" /></Link>
    </section>
  );
};
