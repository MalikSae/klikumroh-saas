'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackMetaEvent } from '../lib/metaPixel';
import { parseRouteLegs } from '../lib/flightRoute';
import {
  ArrowLeft,
  Share2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plane,
  Star,
  Check,
  X,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';
import type { PublicPackage } from './publicPackage';
import type { PublicTenantInfo } from '../app/page';
import { MobileContainer } from './MobileContainer';
import { ProspectModal } from './ProspectModal';
import { Button } from './Button';
import { agentPackageLink, canShareFiles, packagePhotoFile, shareCountsAsHabit, sharePackage } from '../lib/packageShare';
import { logHabit } from '../lib/agentHabits';
import { ConsultantCard } from './ConsultantCard';
import { useConsultant } from '../lib/consultant';
import './PackageDetailClientView.css';

export interface PackageDetailClientViewProps {
  pkg: PublicPackage;
  tenantInfo: PublicTenantInfo | null;
}

export const PackageDetailClientView: React.FC<PackageDetailClientViewProps> = ({ pkg, tenantInfo }) => {
  const router = useRouter();
  const consultant = useConsultant();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'facilities' | 'accommodation' | 'itinerary' | 'terms'>('facilities');
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);

  // Meta standard event: a visitor viewed this package.
  useEffect(() => {
    trackMetaEvent('ViewContent', {
      content_ids: [String(pkg.id)],
      content_name: pkg.name,
      content_type: 'product',
      content_category: 'umroh',
      currency: 'IDR',
      value: pkg.price || 0,
    });
  }, [pkg.id, pkg.name, pkg.price]);

  const ppiuNumber = tenantInfo?.ppiu_number?.trim().replace(/^PPIU\s*/i, '').replace(/^No\.?\s*/i, '') || '';

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
    ? new Date(pkg.departure_date.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Jadwal Fleksibel';

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  // An active agent viewing this page shares through their referral route, so the jamaah who opens the
  // link is recorded as theirs. Everyone else shares the page address.
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem('agent_token');
    } catch {}
    if (!token) return;
    fetch('/api/agent/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const agent = json?.agent || json?.data?.agent || json;
        if (agent?.status === 'active' && agent?.referral_code) setReferralCode(agent.referral_code);
      })
      .catch(() => {});
  }, []);

  // The photo travels with the message; prepared ahead so the share sheet opens right on tap.
  const sharePhoto = pkg.photos && pkg.photos.length > 0 ? photos[0].file_path : '';
  useEffect(() => {
    if (!sharePhoto || !canShareFiles()) return;
    let alive = true;
    packagePhotoFile(sharePhoto, pkg.name).then((f) => {
      if (alive) setPhotoFile(f);
    });
    return () => {
      alive = false;
    };
  }, [sharePhoto, pkg.name]);

  const handleShare = async () => {
    const link = referralCode ? agentPackageLink(referralCode, pkg.id) : `${window.location.origin}/paket/${pkg.id}`;
    const result = await sharePackage({ ...pkg, travel_name: tenantInfo?.name }, link, photoFile);
    // Logged only after the share really happened, never for a cancelled or failed share sheet.
    if (referralCode && shareCountsAsHabit(result)) logHabit('share');
    if (result === 'copied' || result === 'failed') {
      setShareMsg(result === 'copied' ? 'Pesan dan link paket tersalin' : 'Gagal membagikan paket');
      setTimeout(() => setShareMsg(null), 2500);
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
    return text
      .split('\n')
      .map((l) => l.trim().replace(/^(?:[-*\u2022]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
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
        return parsed.map((item: { city?: string; name?: string; stars?: unknown }) => ({
          city: item.city || 'Hotel',
          name: item.name || '',
          stars: typeof item.stars === 'number' && item.stars >= 1 && item.stars <= 5 ? item.stars : 0,
        }));
      }
    } catch {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      return lines.map((line) => {
        let stars = 0;
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

  const routeLegs = parseRouteLegs;

  const itineraryItems = parseItinerary(pkg.itinerary);
  const includedFacilities = parseLines(pkg.facilities_included);
  const excludedFacilities = parseLines(pkg.facilities_excluded);
  const hotels = parseHotels(pkg.hotel_info);
  const parsedFlight = parseFlight(pkg.flight_info);
  const termsList = parseLines(pkg.terms_conditions);

  const flightSummary = parsedFlight?.airline ? parsedFlight.airline.replace(/\(.*?\)/g, '').trim() : '';

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
        {shareMsg && (
          <p className="tw-pkg-share-toast" role="status">
            {shareMsg}
          </p>
        )}

        {/* 2. Hero Photo Gallery */}
        <div className="tw-pkg-gallery">
          <div className="tw-pkg-gallery__image-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element -- package photo uploaded by the travel, served as-is */}
            <img
              src={photos[currentPhotoIndex].file_path}
              alt={pkg.name}
              className="tw-pkg-gallery__img"
            />

            {/* Floating Photo Counter (clean text, no icon) */}
            {photos.length > 1 && (
              <div className="tw-pkg-gallery__counter">
                <span>
                  {currentPhotoIndex + 1} / {photos.length}
                </span>
              </div>
            )}

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
          <div className="tw-pkg-main-info">
            <p className="tw-pkg-travel-tag">
              {tenantInfo?.name || 'Travel umroh'}
              {ppiuNumber ? ` · Izin PPIU ${ppiuNumber}` : ''}
            </p>
            <h1 className="tw-pkg-title">{pkg.name}</h1>
            <ul className="tw-pkg-facts">
              <li className="tw-pkg-fact">
                <Calendar size={16} className="tw-pkg-fact__icon" aria-hidden="true" />
                <span>
                  Berangkat <b>{formattedDate}</b>
                </span>
              </li>
              {flightSummary && (
                <li className="tw-pkg-fact">
                  <Plane size={16} className="tw-pkg-fact__icon" aria-hidden="true" />
                  <span>{flightSummary}</span>
                </li>
              )}
            </ul>
            <ConsultantCard consultant={consultant} travelName={tenantInfo?.name || 'travel ini'} className="tw-consultant--below" onAsk={() => setIsProspectModalOpen(true)} />
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
            <div className="tw-pkg-tabs-nav" role="tablist" aria-label="Informasi paket">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'facilities'}
                className={`tw-pkg-tab-btn ${activeTab === 'facilities' ? 'active' : ''}`}
                onClick={() => setActiveTab('facilities')}
              >
                Fasilitas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'accommodation'}
                className={`tw-pkg-tab-btn ${activeTab === 'accommodation' ? 'active' : ''}`}
                onClick={() => setActiveTab('accommodation')}
              >
                Akomodasi
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'itinerary'}
                className={`tw-pkg-tab-btn ${activeTab === 'itinerary' ? 'active' : ''}`}
                onClick={() => setActiveTab('itinerary')}
              >
                Jadwal Perjalanan
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'terms'}
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
                    <h2 className="tw-facility-title">Termasuk</h2>
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
                    <p className="tw-pkg-empty-text">Belum ada informasi fasilitas.</p>
                  )}
                </div>

                {/* Belum Termasuk */}
                <div className="tw-facility-card tw-facility-card--excluded">
                  <div className="tw-facility-header">
                    <h2 className="tw-facility-title">Tidak termasuk</h2>
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
                    <p className="tw-pkg-empty-text">Belum ada informasi.</p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: AKOMODASI: hotels and flight, each in one tinted panel */}
            {activeTab === 'accommodation' && (
              <div className="tw-pkg-accommodation-view">
                <section>
                  <h2 className="tw-accomm-section-header">Hotel</h2>
                  {hotels.length > 0 ? (
                    <ul className="tw-accomm-panel">
                      {hotels.map((h, idx) => (
                        <li key={idx} className="tw-hotel-row">
                          <div className="tw-hotel-row__main">
                            <span className="tw-hotel-row__city">{h.city}</span>
                            <span className="tw-hotel-row__name">{h.name}</span>
                          </div>
                          {h.stars > 0 && (
                            <span className="tw-hotel-row__stars" aria-label={`Bintang ${h.stars}`}>
                              <Star size={13} className="tw-hotel-star-icon--filled" fill="currentColor" stroke="none" aria-hidden="true" />
                              {h.stars}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="tw-pkg-empty-box">Informasi hotel belum diunggah untuk paket ini.</div>
                  )}
                </section>

                <section>
                  <h2 className="tw-accomm-section-header">Penerbangan</h2>
                  {parsedFlight && (parsedFlight.airline || parsedFlight.route) ? (
                    <div className="tw-accomm-panel">
                      {parsedFlight.airline && (
                        <div className="tw-flight-airline">
                          <Plane size={16} aria-hidden="true" />
                          <span>{parsedFlight.airline}</span>
                        </div>
                      )}
                      {routeLegs(parsedFlight.route).length > 0 && (
                        <ul className="tw-flight-legs">
                          {routeLegs(parsedFlight.route).map((leg, idx) => (
                            <li key={idx} className="tw-flight-leg">
                              {leg.stops.length > 0
                                ? leg.stops.map((stop, i) => (
                                    <React.Fragment key={i}>
                                      {i > 0 && <ArrowRight size={14} className="tw-flight-leg__arrow" aria-label="ke" />}
                                      <span>{stop}</span>
                                    </React.Fragment>
                                  ))
                                : leg.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="tw-pkg-empty-box">Informasi penerbangan belum diunggah untuk paket ini.</div>
                  )}
                </section>
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
                    <h2 className="tw-terms-title">Ketentuan & kebijakan pembatalan</h2>
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

        </div>

        {/* 9. STICKY BOTTOM ACTION BAR (Price & Consultation Button) */}
        <div className="tw-pkg-sticky-bar">
          <div className="tw-pkg-sticky-price">
            <span className="tw-pkg-sticky-price__label">Mulai dari</span>
            <span className="tw-pkg-sticky-price__amount">{formattedPrice}</span>
          </div>

          {/* Tombol Konsultasi (UTAMA) */}
          <Button
            variant="primary"
            size="sm"
            fullWidth={false}
            className="tw-pkg-sticky-consult-btn"
            onClick={() => setIsProspectModalOpen(true)}
          >
            <MessageCircle size={18} aria-hidden="true" />
            <span>Konsultasi Sekarang</span>
          </Button>
        </div>

        {/* 10. Prospect / Consultation Modal */}
        <ProspectModal
          isOpen={isProspectModalOpen}
          onClose={() => setIsProspectModalOpen(false)}
          selectedPackage={{ id: pkg.id, name: pkg.name }}
          tenantName={tenantInfo?.name}
        />
      </MobileContainer>
    </div>
  );
};
