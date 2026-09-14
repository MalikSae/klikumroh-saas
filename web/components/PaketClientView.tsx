'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { MobileContainer } from './MobileContainer';
import { PublicHeader } from './PublicHeader';
import { PackageCard } from './PackageCard';
import { PublicFooter } from './PublicFooter';
import { BottomNavbar } from './BottomNavbar';
import { MenuBottomSheet } from './MenuBottomSheet';
import { ProspectModal } from './ProspectModal';
import { Button } from './Button';
import type { PublicPackage } from './PublicCatalog';
import type { PublicTenantInfo } from '../app/page';
import { selectHomePackages, type PackageOrder } from './home-package-selection';
import designTokens from '../../design-tokens.json';
import './HomeClientView.css';
import './PaketClientView.css';

const PAGE_SIZE = 4;

const WhatsAppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.05 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

export interface PaketClientViewProps {
  packages: PublicPackage[];
  tenantInfo: PublicTenantInfo | null;
}

export const PaketClientView: React.FC<PaketClientViewProps> = ({
  packages,
  tenantInfo,
}) => {
  const router = useRouter();
  const [order, setOrder] = useState<PackageOrder>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<PublicPackage | null>(null);
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);
  const [isMenuSheetOpen, setIsMenuSheetOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, order]);

  const displayedPackages = selectHomePackages(packages, searchQuery, '', order);
  const paginatedPackages = displayedPackages.slice(0, visibleCount);
  const hasMore = visibleCount < displayedPackages.length;

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, displayedPackages.length));
            setIsLoadingMore(false);
          }, 300);
        }
      },
      {
        rootMargin: '120px',
        threshold: 0.1,
      }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasMore, isLoadingMore, displayedPackages.length]);

  const layoutStyle = Object.fromEntries(
    Object.entries(designTokens.publicConversionLayout).map(([key, value]) => ['--cro-' + key, value])
  );
  const brandingStyle = tenantInfo?.brand_primary_color
    ? { '--tw-brand-primary': tenantInfo.brand_primary_color }
    : {};

  return (
    <div className="tw-home" style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}>
      <MobileContainer>
        <PublicHeader
          title="Katalog Paket"
          showBack={true}
          onBackClick={handleBack}
          backHref="/"
        />

        {/* 1. Header Section */}
        <div className="tw-pkg-catalog-header">
          <span className="tw-pkg-catalog-tag">Pilihan Paket</span>
          <h1 className="tw-pkg-catalog-title">Semua Paket Umroh</h1>
          <p className="tw-pkg-catalog-subtitle">
            Pilihan jadwal keberangkatan resmi dan fasilitas terbaik dari {tenantInfo?.name || 'kami'}.
          </p>
        </div>

        {/* 2. Search Input */}
        <div className="tw-pkg-search-wrap">
          <div className="tw-pkg-search-box">
            <Search size={18} className="tw-pkg-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="tw-pkg-search-input"
              placeholder="Cari nama paket umroh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cari paket umroh"
            />
            {searchQuery && (
              <button
                type="button"
                className="tw-pkg-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus pencarian"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* 3. Underline Tabs (Sort: Identical to Home Rekomendasi B) */}
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

        {/* 4. 2-Column Package Grid */}
        {displayedPackages.length === 0 ? (
          <div className="tw-pkg-tabs-section__empty" style={{ margin: '0 16px 20px' }}>
            <Search className="tw-home-icon" aria-hidden="true" />
            <h3>Paket tidak ditemukan</h3>
            <p>
              {searchQuery
                ? `Tidak ada paket umroh yang cocok dengan "${searchQuery}".`
                : 'Saat ini belum ada paket umroh yang dipublikasikan.'}
            </p>
            {searchQuery && (
              <div style={{ marginTop: '12px' }}>
                <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setSearchQuery('')}>
                  Reset Pencarian
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="tw-pkg-tabs-section__list">
              {paginatedPackages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  id={pkg.id}
                  name={pkg.name}
                  price={pkg.price || undefined}
                  departureDateRaw={pkg.departure_date}
                  quota={pkg.quota ?? undefined}
                  badge={pkg.quota !== null && pkg.quota !== undefined ? `Sisa ${pkg.quota} Kursi` : undefined}
                  imageUrl={pkg.photos?.[0]?.file_path}
                  onSelect={() => router.push(`/paket/${pkg.id}`)}
                  className="tw-package-card--ota"
                />
              ))}
            </div>

            {/* Sentinel for Infinite Scroll */}
            {hasMore && <div ref={sentinelRef} className="tw-pkg-infinite-sentinel" aria-hidden="true" />}

            {/* Loading More Indicator */}
            {isLoadingMore && (
              <div className="tw-pkg-infinite-loader">
                <div className="tw-pkg-spinner" aria-hidden="true" />
                <span>Memuat paket umroh...</span>
              </div>
            )}

            {/* End of List Indicator */}
            {!hasMore && displayedPackages.length > PAGE_SIZE && (
              <div className="tw-pkg-infinite-end">
                <span>Semua {displayedPackages.length} paket telah ditampilkan</span>
              </div>
            )}
          </>
        )}

        {/* 5. Consultation CTA */}
        <section className="tw-cta" style={{ paddingTop: '16px', paddingBottom: '20px' }}>
          <div className="tw-cta__card">
            <h3 className="tw-cta__title">Belum Menemukan Jadwal yang Sesuai?</h3>
            <p className="tw-cta__text">
              Konsultasikan kebutuhan umroh Anda dan keluarga bersama tim konsultan kami.
            </p>
            <div className="tw-cta__action">
              <Button
                variant="primary"
                onClick={() => {
                  setSelectedPackage(null);
                  setIsProspectModalOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <WhatsAppIcon size={18} />
                <span>Konsultasi Gratis</span>
              </Button>
            </div>
          </div>
        </section>

        {/* 5. Public Footer */}
        <PublicFooter
          tenantName={tenantInfo?.name}
          address={tenantInfo?.address}
          phone={tenantInfo?.phone}
          whatsappNumber={tenantInfo?.whatsapp_number}
          email={tenantInfo?.email}
          ppiuNumber={tenantInfo?.ppiu_number}
        />
      </MobileContainer>

      {/* 6. Bottom Navbar */}
      <BottomNavbar
        onOpenMenu={() => setIsMenuSheetOpen(true)}
        waNumber={tenantInfo?.whatsapp_number || undefined}
      />

      {/* 7. Menu Bottom Sheet */}
      <MenuBottomSheet
        isOpen={isMenuSheetOpen}
        onClose={() => setIsMenuSheetOpen(false)}
      />

      {/* 8. Prospect / Consultation Modal */}
      <ProspectModal
        isOpen={isProspectModalOpen}
        onClose={() => setIsProspectModalOpen(false)}
        selectedPackage={
          selectedPackage
            ? { id: selectedPackage.id, name: selectedPackage.name }
            : null
        }
      />
    </div>
  );
};
