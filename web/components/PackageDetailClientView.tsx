'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Share2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plane,
  ShieldCheck,
  CheckCircle2,
  Star,
  Check,
  X,
} from 'lucide-react';
import type { PublicPackage } from './PublicCatalog';
import type { PublicTenantInfo } from '../app/page';
import { MobileContainer } from './MobileContainer';
import { PublicFooter } from './PublicFooter';
import { ProspectModal } from './ProspectModal';
import { Button } from './Button';
import './PackageDetailClientView.css';

const WhatsAppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
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

export interface PackageDetailClientViewProps {
  pkg: PublicPackage;
  tenantInfo: PublicTenantInfo | null;
}

export const PackageDetailClientView: React.FC<PackageDetailClientViewProps> = ({ pkg, tenantInfo }) => {
  const router = useRouter();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'facilities' | 'accommodation' | 'itinerary' | 'terms'>('facilities');
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);

  const photos = pkg.photos && pkg.photos.length > 0
    ? pkg.photos
    : [{ id: 0, file_path: '/placeholder-package.webp', sort_order: 0 }];

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  const formattedPrice = pkg.price
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(pkg.price)
    : 'Hubungi Kami';

  const formattedDate = pkg.departure_date
    ? new Date(pkg.departure_date).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Jadwal Fleksibel';

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: pkg.name,
          text: `Lihat paket umroh ${pkg.name} dari ${tenantInfo?.name || 'kami'}`,
          url: window.location.href,
        })
        .catch(() => {});
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      alert('Tautan paket berhasil disalin ke clipboard');
    }
  };

  const formatText = (text?: string | null) => {
    if (!text) return null;
    const hasDoubleNewline = /\n\s*\n/.test(text);
    if (hasDoubleNewline) {
      const paragraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);

      return (
        <div className="tw-pkg-formatted-text">
          {paragraphs.map((p, i) => (
            <p key={i} className="tw-pkg-text-paragraph">
              {p.split('\n').map((line, lIdx, arr) => (
                <React.Fragment key={lIdx}>
                  {line}
                  {lIdx < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </p>
          ))}
        </div>
      );
    }

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return (
      <div className="tw-pkg-formatted-text">
        {lines.map((line, i) => (
          <p key={i} className="tw-pkg-text-paragraph">
            {line}
          </p>
        ))}
      </div>
    );
  };

  const parseItinerary = (text?: string | null) => {
    if (!text) return [];
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const items: { day: string; title: string; desc: string }[] = [];

    lines.forEach((line) => {
      const match = line.match(/^(Hari\s*\d+)\s*:\s*(.*)/i);
      if (match) {
        items.push({
          day: match[1],
          title: match[1],
          desc: match[2],
        });
      } else {
        if (items.length > 0) {
          items[items.length - 1].desc += `\n${line}`;
        } else {
          items.push({
            day: 'Info',
            title: 'Rencana Perjalanan',
            desc: line,
          });
        }
      }
    });
    return items;
  };

  const parseLines = (text?: string | null) => {
    if (!text) return [];
    return text.split('\n').map((l) => l.trim()).filter(Boolean);
  };

  interface ParsedHotel {
    city: string;
    name: string;
    stars: number;
  }

  interface ParsedFlight {
    airline?: string;
    route?: string;
  }

  const parseFlight = (text?: string | null): ParsedFlight | null => {
    if (!text) return null;
    try {
      const data = JSON.parse(text);
      if (data && typeof data === 'object') {
        return {
          airline: data.airline || undefined,
          route: data.route || undefined,
        };
      }
    } catch {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        return { airline: lines[0], route: lines.slice(1).join('\n') };
      } else if (lines.length === 1) {
        return { airline: lines[0] };
      }
    }
    return { route: text };
  };

  const parseHotels = (text?: string | null): ParsedHotel[] => {
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          city: item.city || 'Hotel',
          name: item.name || '',
          stars: typeof item.stars === 'number' && item.stars >= 1 && item.stars <= 5 ? item.stars : 5,
        }));
      }
    } catch {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      return lines.map((line) => {
        let stars = 5;
        const starMatch = line.match(/bintang\s*(\d)/i);
        if (starMatch) {
          const s = parseInt(starMatch[1], 10);
          if (s >= 1 && s <= 5) stars = s;
        }

        const match = line.match(/^([^:]+):\s*(.*)/);
        if (match) {
          const cleanName = match[2].replace(/\(Bintang\s*\d+\)/i, '').replace(/Bintang\s*\d+/i, '').trim();
          return { city: match[1].trim(), name: cleanName, stars };
        }
        const cleanName = line.replace(/\(Bintang\s*\d+\)/i, '').replace(/Bintang\s*\d+/i, '').trim();
        return { city: 'Hotel', name: cleanName, stars };
      });
    }
    return [];
  };

  const itineraryItems = parseItinerary(pkg.itinerary);
  const includedFacilities = parseLines(pkg.facilities_included);
  const excludedFacilities = parseLines(pkg.facilities_excluded);
  const hotels = parseHotels(pkg.hotel_info);
  const parsedFlight = parseFlight(pkg.flight_info);
  const termsList = parseLines(pkg.terms_conditions);

  const flightSummary = parsedFlight?.airline
    ? parsedFlight.airline.replace(/\(.*?\)/g, '').trim() || 'Penerbangan PP'
    : 'Penerbangan PP';

  const brandingStyle = tenantInfo?.brand_primary_color
    ? ({ '--tw-brand-primary': tenantInfo.brand_primary_color } as React.CSSProperties)
    : undefined;

  return (
    <div className="tw-pkg-detail-page" style={brandingStyle}>
      <MobileContainer>
        {/* 1. Mobile Top App Bar */}
        <header className="tw-pkg-topbar">
          <button
            type="button"
            onClick={handleBack}
            className="tw-pkg-topbar-btn"
            aria-label="Kembali ke halaman sebelumnya"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="tw-pkg-topbar-title">Detail Paket</div>
          <button
            type="button"
            onClick={handleShare}
            className="tw-pkg-topbar-btn"
            aria-label="Bagikan Paket"
          >
            <Share2 size={19} />
          </button>
        </header>

        {/* 2. Hero Photo Gallery */}
        <div className="tw-pkg-gallery">
          <div className="tw-pkg-gallery__image-wrap">
            <img
              src={photos[currentPhotoIndex].file_path}
              alt={pkg.name}
              className="tw-pkg-gallery__img"
            />

            {/* Floating Quota Badge (top-left, frosted glass matching Home) */}
            {pkg.quota !== undefined && pkg.quota !== null && pkg.quota > 0 && (
              <div className="tw-pkg-gallery__badge">
                <span>Sisa {pkg.quota} Kursi</span>
              </div>
            )}

            {/* Floating Photo Counter (clean text, no icon) */}
            <div className="tw-pkg-gallery__counter">
              <span>
                {currentPhotoIndex + 1} / {photos.length}
              </span>
            </div>

            {/* Gallery Navigation for Multiple Photos */}
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  className="tw-pkg-gallery__nav tw-pkg-gallery__nav--prev"
                  onClick={prevPhoto}
                  aria-label="Foto sebelumnya"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className="tw-pkg-gallery__nav tw-pkg-gallery__nav--next"
                  onClick={nextPhoto}
                  aria-label="Foto berikutnya"
                >
                  <ChevronRight size={20} />
                </button>
                <div className="tw-pkg-gallery__dots">
                  {photos.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`tw-pkg-gallery__dot ${idx === currentPhotoIndex ? 'active' : ''}`}
                      onClick={() => setCurrentPhotoIndex(idx)}
                      aria-label={`Lihat foto ${idx + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3. Package Main Info & Content */}
        <div className="tw-pkg-content-wrap">
          {/* Main Info (clean text tag, no icon) */}
          <div className="tw-pkg-main-info">
            <div className="tw-pkg-travel-tag">
              <span>{tenantInfo?.name || 'KlikUmroh Travel'} • PPIU Resmi Kemenag</span>
            </div>
            <h1 className="tw-pkg-title">{pkg.name}</h1>
          </div>

          {/* Price Banner Card (clean badge, no icon) */}
          <div className="tw-pkg-price-card">
            <div className="tw-pkg-price-card__left">
              <span className="tw-pkg-price-card__label">Mulai dari</span>
              <div className="tw-pkg-price-card__amount">{formattedPrice}</div>
              <span className="tw-pkg-price-card__sublabel">/ jamaah (Sekamar berempat)</span>
            </div>
            <div className="tw-pkg-price-card__badge">
              <span>{pkg.quota && pkg.quota > 0 ? `Sisa ${pkg.quota} Kursi` : 'Tersedia'}</span>
            </div>
          </div>

          {/* Quick Specs Grid (2x2 with icons) */}
          {/* Quick Specs Grid (Keberangkatan & Penerbangan - Clean standalone icons) */}
          <div className="tw-pkg-specs">
            <div className="tw-pkg-spec-card">
              <Calendar size={18} className="tw-pkg-spec-icon" />
              <div className="tw-pkg-spec-info">
                <span className="tw-pkg-spec-label">Keberangkatan</span>
                <span className="tw-pkg-spec-val">{formattedDate}</span>
              </div>
            </div>

            <div className="tw-pkg-spec-card">
              <Plane size={18} className="tw-pkg-spec-icon" />
              <div className="tw-pkg-spec-info">
                <span className="tw-pkg-spec-label">Penerbangan</span>
                <span className="tw-pkg-spec-val">{flightSummary}</span>
              </div>
            </div>
          </div>

          {/* Package Description (Seamless) */}
          {pkg.description && (
            <div className="tw-pkg-desc-section">
              <div className="tw-pkg-desc-title">Deskripsi Perjalanan</div>
              <div className="tw-pkg-desc-text">{formatText(pkg.description)}</div>
            </div>
          )}

          {/* 4. Seamless Underline Tabs */}
          <div className="tw-pkg-tabs-wrapper">
            <div className="tw-pkg-tabs-nav">
              <button
                type="button"
                className={`tw-pkg-tab-btn ${activeTab === 'facilities' ? 'active' : ''}`}
                onClick={() => setActiveTab('facilities')}
              >
                Fasilitas
              </button>
              <button
                type="button"
                className={`tw-pkg-tab-btn ${activeTab === 'accommodation' ? 'active' : ''}`}
                onClick={() => setActiveTab('accommodation')}
              >
                Akomodasi
              </button>
              <button
                type="button"
                className={`tw-pkg-tab-btn ${activeTab === 'itinerary' ? 'active' : ''}`}
                onClick={() => setActiveTab('itinerary')}
              >
                Itinerary
              </button>
              <button
                type="button"
                className={`tw-pkg-tab-btn ${activeTab === 'terms' ? 'active' : ''}`}
                onClick={() => setActiveTab('terms')}
              >
                Syarat & Ketentuan
              </button>
            </div>
          </div>

          {/* 5. Tab Content Panels */}
          <div className="tw-pkg-tab-panel">
            {/* TAB 1: FASILITAS (Clean minimalist list, no icon overload) */}
            {activeTab === 'facilities' && (
              <div className="tw-pkg-facilities-view">
                {/* Termasuk */}
                <div className="tw-facility-card tw-facility-card--included">
                  <div className="tw-facility-header">
                    <span className="tw-facility-title">Sudah Termasuk (Included)</span>
                  </div>
                  {includedFacilities.length > 0 ? (
                    <ul className="tw-facility-list">
                      {includedFacilities.map((item, idx) => (
                        <li key={idx} className="tw-facility-item">
                          <Check size={15} className="tw-facility-icon tw-facility-icon--inc" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="tw-pkg-empty-text">Informasi fasilitas termasuk belum tersedia.</p>
                  )}
                </div>

                {/* Belum Termasuk */}
                <div className="tw-facility-card tw-facility-card--excluded">
                  <div className="tw-facility-header">
                    <span className="tw-facility-title">Belum Termasuk (Excluded)</span>
                  </div>
                  {excludedFacilities.length > 0 ? (
                    <ul className="tw-facility-list">
                      {excludedFacilities.map((item, idx) => (
                        <li key={idx} className="tw-facility-item">
                          <X size={15} className="tw-facility-icon tw-facility-icon--exc" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="tw-pkg-empty-text">Informasi fasilitas belum termasuk belum tersedia.</p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: AKOMODASI (Clean typography cards, structured hotel & flight) */}
            {activeTab === 'accommodation' && (
              <div className="tw-pkg-accommodation-view">
                {/* Hotel Card (Unified Single Card) */}
                <div className="tw-accomm-section">
                  <div className="tw-accomm-section-header">
                    <span>Hotel Penginapan</span>
                  </div>
                  {hotels.length > 0 ? (
                    <div className="tw-hotel-card">
                      {hotels.map((h, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <div className="tw-hotel-card__divider" />}
                          <div className="tw-hotel-card__row">
                            <span className="tw-hotel-card__city-label">{h.city}</span>
                            <div className="tw-hotel-card__content">
                              <div className="tw-hotel-card__name">{h.name}</div>
                              <div className="tw-hotel-card__stars" aria-label={`Bintang ${h.stars} dari 5`}>
                                {[1, 2, 3, 4, 5].map((starNum) => {
                                  const isFilled = starNum <= h.stars;
                                  return (
                                    <Star
                                      key={starNum}
                                      size={14}
                                      className={`tw-hotel-star-icon ${isFilled ? 'tw-hotel-star-icon--filled' : 'tw-hotel-star-icon--empty'}`}
                                      fill="currentColor"
                                      stroke="none"
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="tw-pkg-empty-box">
                      Informasi hotel belum diunggah untuk paket ini.
                    </div>
                  )}
                </div>

                {/* Flight Card */}
                <div className="tw-accomm-section">
                  <div className="tw-accomm-section-header">
                    <span>Maskapai & Penerbangan</span>
                  </div>
                  {parsedFlight && (parsedFlight.airline || parsedFlight.route) ? (
                    <div className="tw-flight-card">
                      {parsedFlight.airline && (
                        <div className="tw-flight-card__row">
                          <div className="tw-flight-card__label">
                            <span>Maskapai Penerbangan</span>
                          </div>
                          <div className="tw-flight-card__value tw-flight-card__value--airline">
                            {parsedFlight.airline}
                          </div>
                        </div>
                      )}
                      {parsedFlight.airline && parsedFlight.route && (
                        <div className="tw-flight-card__divider" />
                      )}
                      {parsedFlight.route && (
                        <div className="tw-flight-card__row">
                          <div className="tw-flight-card__label">
                            <span>Rute Perjalanan</span>
                          </div>
                          <div className="tw-flight-card__value">
                            {formatText(parsedFlight.route)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="tw-pkg-empty-box">
                      Informasi maskapai penerbangan belum diunggah untuk paket ini.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: ITINERARY (Clean numbered timeline) */}
            {activeTab === 'itinerary' && (
              <div className="tw-pkg-itinerary-view">
                {itineraryItems.length > 0 ? (
                  <div className="tw-itinerary-timeline">
                    {itineraryItems.map((item, idx) => (
                      <div key={idx} className="tw-itinerary-item">
                        <div className="tw-itinerary-marker">
                          <div className="tw-itinerary-dot">{idx + 1}</div>
                          {idx < itineraryItems.length - 1 && <div className="tw-itinerary-line" />}
                        </div>
                        <div className="tw-itinerary-body">
                          <div className="tw-itinerary-title">{item.title}</div>
                          <div className="tw-itinerary-text">{formatText(item.desc)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tw-pkg-empty-box">
                    Jadwal perjalanan detail belum diunggah untuk paket ini. Hubungi konsultan kami untuk informasi lengkap.
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: SYARAT & KETENTUAN */}
            {activeTab === 'terms' && (
              <div className="tw-pkg-terms-view">
                <div className="tw-terms-card">
                  <div className="tw-terms-header">
                    <span className="tw-terms-title">Ketentuan & Kebijakan Pembatalan</span>
                  </div>
                  {termsList.length > 0 ? (
                    <ul className="tw-terms-list">
                      {termsList.map((term, idx) => (
                        <li key={idx} className="tw-terms-item">
                          <div className="tw-terms-bullet" />
                          <span>{term}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="tw-pkg-empty-box">
                      Syarat dan ketentuan pendaftaran belum diunggah untuk paket ini.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 6. Trust & Security Strip with icons */}
          <div className="tw-pkg-trust-strip">
            <div className="tw-pkg-trust-item">
              <ShieldCheck size={20} className="tw-pkg-trust-icon" />
              <div className="tw-pkg-trust-text">
                <div className="tw-pkg-trust-label">Resmi Kemenag</div>
                <div className="tw-pkg-trust-sub">Izin PPIU Terakreditasi</div>
              </div>
            </div>
            <div className="tw-pkg-trust-item">
              <CheckCircle2 size={20} className="tw-pkg-trust-icon" />
              <div className="tw-pkg-trust-text">
                <div className="tw-pkg-trust-label">Pasti Berangkat</div>
                <div className="tw-pkg-trust-sub">Jadwal & Kuota Terjamin</div>
              </div>
            </div>
          </div>
        </div>

        {/* 7. Public Footer (Full width of MobileContainer, identical to Home) */}
        <PublicFooter
          tenantName={tenantInfo?.name}
          address={tenantInfo?.address}
          phone={tenantInfo?.phone}
          whatsappNumber={tenantInfo?.whatsapp_number}
          email={tenantInfo?.email}
          ppiuNumber={tenantInfo?.ppiu_number}
        />

        {/* 9. STICKY BOTTOM ACTION BAR (Price & Consultation Button) */}
        <div className="tw-pkg-sticky-bar">
          <div className="tw-pkg-sticky-price">
            <span className="tw-pkg-sticky-price__label">Mulai dari</span>
            <div className="tw-pkg-sticky-price__row">
              <span className="tw-pkg-sticky-price__amount">{formattedPrice}</span>
              <span className="tw-pkg-sticky-price__unit">/jamaah</span>
            </div>
          </div>

          {/* Tombol Konsultasi (UTAMA) */}
          <Button
            variant="primary"
            size="sm"
            fullWidth={false}
            className="tw-pkg-sticky-consult-btn"
            onClick={() => setIsProspectModalOpen(true)}
          >
            <WhatsAppIcon size={16} />
            <span>Konsultasi Sekarang</span>
          </Button>
        </div>

        {/* 10. Prospect / Consultation Modal */}
        <ProspectModal
          isOpen={isProspectModalOpen}
          onClose={() => setIsProspectModalOpen(false)}
          selectedPackage={{ id: pkg.id, name: pkg.name }}
        />
      </MobileContainer>
    </div>
  );
};
