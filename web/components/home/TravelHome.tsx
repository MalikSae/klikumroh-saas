'use client';

// Travel home page (rebuilt from scratch, 1 Oct 2026). Mobile-locked, one goal: the visitor sends an
// interest form or contacts the travel on WhatsApp. Order: banner carousel, trust chips, nearest packages,
// testimonials, FAQ, closing call to action, agent link, footer, plus a mobile-app bottom tab bar.
// Every section uses only the travel's own data and is hidden when that data is empty.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, MessageCircle, ShieldCheck, Star, User, Users } from 'lucide-react';
import { MobileContainer } from '../MobileContainer';
import { PublicFooter } from '../PublicFooter';
import { jakartaDayKey } from '../../lib/jakartaTime';
import { ProspectModal } from '../ProspectModal';
import type { PublicPackage } from '../publicPackage';
import type { PublicTenantInfo } from '../../app/page';
import type { PublicBannerItem, PublicFAQItem, PublicTestimonialItem } from './homeData';
import { PublicTabBar } from '../PublicTabBar';
import { PackageTile } from '../PackageTile';
import { ConsultantCard } from '../ConsultantCard';
import { useConsultant } from '../../lib/consultant';
import './TravelHome.css';

const MAX_PACKAGES = 4;
const MAX_FAQ = 5;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** PPIU licence number without a leading "PPIU" / "No." the travel may have typed. */
const ppiuOf = (t: PublicTenantInfo) => t.ppiu_number?.trim().replace(/^PPIU\s*/i, '').replace(/^No\.?\s*/i, '') || '';

/** Upcoming packages first (soonest departure), then the ones without a date. */
const nearest = (list: PublicPackage[]) => {
  // Today in WIB: departure dates are WIB calendar days (the server renders in UTC).
  const today = jakartaDayKey(new Date());
  const time = (p: PublicPackage) => (p.departure_date ? p.departure_date.slice(0, 10) : '9999');
  return [...list].filter((p) => !p.departure_date || p.departure_date.slice(0, 10) >= today).sort((a, b) => time(a).localeCompare(time(b)));
};

export interface TravelHomeProps {
  tenantInfo: PublicTenantInfo;
  packages: PublicPackage[];
  banners: PublicBannerItem[];
  testimonials: PublicTestimonialItem[];
  faqs: PublicFAQItem[];
}

export const TravelHome: React.FC<TravelHomeProps> = ({ tenantInfo, packages, banners, testimonials, faqs }) => {
  const [interest, setInterest] = useState<{ open: boolean; pkg: { id: number; name: string } | null }>({ open: false, pkg: null });
  // A visitor who came through a consultant's referral link sees who helps them. Every contact goes through
  // the interest form (no direct WhatsApp button): it saves the prospect, then opens the chat.
  const consultant = useConsultant();
  const upcomingList = useMemo(() => nearest(packages), [packages]);
  const upcoming = upcomingList.length;
  const shown = upcomingList.slice(0, MAX_PACKAGES);
  const openInterest = (pkg: { id: number; name: string } | null = null) => setInterest({ open: true, pkg });

  return (
    <div className="th">
      <MobileContainer>
        <Header tenant={tenantInfo} />
        <BannerCarousel banners={banners} tenant={tenantInfo} />
        <TrustChips tenant={tenantInfo} />
        <ConsultantCard consultant={consultant} travelName={tenantInfo.name} className="th-consultant" onAsk={() => openInterest()} />

        <section className="th-section" id="paket" aria-labelledby="th-paket">
          {/* Headings speak to the visitor's goal; the subline only states real numbers. */}
          <div className="th-section__head">
            <div>
              <h2 id="th-paket" className="th-title">Pilih jadwal umroh Anda</h2>
              {upcoming > 0 && <p className="th-sub">{upcoming} jadwal keberangkatan tersedia</p>}
            </div>
            {shown.length > 0 && (
              <Link href="/paket" className="th-more">
                Lihat semua <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
          {shown.length === 0 ? (
            <div className="th-empty">
              <p>Jadwal paket berikutnya segera diumumkan. Tanyakan jadwal terdekat langsung ke tim kami.</p>
              <button type="button" className="th-btn th-btn--primary" onClick={() => openInterest()}>
                Tanya jadwal
              </button>
            </div>
          ) : (
            <div className="th-packages">
              {shown.map((p) => (
                <PackageTile key={p.id} pkg={p} />
              ))}
            </div>
          )}
        </section>

        <Testimonials items={testimonials} />
        <Faq items={faqs} onAsk={() => openInterest()} />

        <section className="th-closing" aria-labelledby="th-closing">
          <h2 id="th-closing" className="th-closing__title">Siap berangkat ke Tanah Suci?</h2>
          <p className="th-closing__text">
            {consultant ? `${consultant.name.split(/\s+/)[0]} siap bantu` : 'Kami bantu'} pilih jadwal dan paket. Gratis.
          </p>
          <div className="th-closing__actions">
            <button type="button" className="th-btn th-btn--primary" onClick={() => openInterest()}>
              Konsultasi gratis
            </button>
          </div>
        </section>

        <section className="th-agent" aria-label="Kemitraan konsultan">
          <Users size={20} aria-hidden="true" />
          <div className="th-agent__text">
            <b>Ingin jadi konsultan {tenantInfo.name}?</b>
            <span>Ajak keluarga dan kerabat berangkat, dapatkan komisi.</span>
          </div>
          <Link href="/agen/daftar" className="th-agent__link">
            Daftar
          </Link>
        </section>

        <PublicFooter
          tenantName={tenantInfo.name}
          address={tenantInfo.address}
          phone={tenantInfo.phone}
          whatsappNumber={tenantInfo.whatsapp_number}
          email={tenantInfo.email}
          ppiuNumber={tenantInfo.ppiu_number}
        />
        <PublicTabBar tenantName={tenantInfo.name} onChat={() => openInterest()} />
      </MobileContainer>

      {/* Rendered inside the canvas so its spacer keeps the footer clear. */}

      <ProspectModal isOpen={interest.open} onClose={() => setInterest({ open: false, pkg: null })} selectedPackage={interest.pkg} tenantName={tenantInfo.name} />
    </div>
  );
};

/* ---------- Header ---------- */
// WhatsApp lives in the bottom tab bar (Chat), so the header only carries the travel's identity.
// Rule: a logo already contains the name, so it is shown alone. Without a logo: the icon (or the
// initials when there is no icon either) next to the travel name. A logo that fails to load falls back.
const Header: React.FC<{ tenant: PublicTenantInfo }> = ({ tenant }) => {
  const [logoOk, setLogoOk] = useState(true);
  const [iconOk, setIconOk] = useState(true);
  const logo = tenant.brand_logo_url && logoOk ? tenant.brand_logo_url : null;
  const icon = tenant.brand_icon_url && iconOk ? tenant.brand_icon_url : null;
  // Licence badge on the right: the strongest trust signal, visible at every scroll position.
  const ppiu = ppiuOf(tenant);
  return (
    <header className="th-head">
      <Link href="/" className="th-head__brand" aria-label={`${tenant.name}, beranda`}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={tenant.name} className="th-head__logo" onError={() => setLogoOk(false)} />
        ) : (
          <>
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="th-head__icon" onError={() => setIconOk(false)} />
            ) : (
              <span className="th-head__mark" aria-hidden="true">{initials(tenant.name)}</span>
            )}
            <span className="th-head__name">{tenant.name}</span>
          </>
        )}
      </Link>
      {ppiu && (
        <span className="th-head__ppiu" title={`Izin PPIU Kemenag ${ppiu}`}>
          <ShieldCheck size={13} aria-hidden="true" />
          <span className="th-head__ppiu-text">
            <b>Izin PPIU</b>
            <span>{ppiu}</span>
          </span>
        </span>
      )}
    </header>
  );
};

/* ---------- Banner carousel (replaces a hero) ---------- */
// Image only (1600 x 700): the travel's banner artwork carries its own text. A banner with a link is one
// big tap target. More than one banner slides by itself every 5 s, pauses while the visitor touches it,
// and stays still for visitors who ask for reduced motion.
const SLIDE_MS = 5000;

const BannerCarousel: React.FC<{ banners: PublicBannerItem[]; tenant: PublicTenantInfo }> = ({ banners, tenant }) => {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  const list = useMemo(() => [...banners].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)), [banners]);

  useEffect(() => {
    if (list.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      const el = track.current;
      if (!el || document.hidden || Date.now() < pausedUntil.current) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % list.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [list.length]);

  // No banner yet: a plain brand-colored intro so the page still opens with the travel's promise.
  if (list.length === 0) {
    return (
      <section className="th-intro">
        <h1 className="th-intro__title">{tenant.tagline?.trim() || `Umroh bersama ${tenant.name}`}</h1>
        <a href="#paket" className="th-btn th-btn--light">
          Lihat paket
        </a>
      </section>
    );
  }

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const hold = () => {
    pausedUntil.current = Date.now() + SLIDE_MS * 2;
  };
  // Arrow buttons: one slide back or forward (wrapping around), and pause the auto slide.
  const go = (step: number) => {
    const el = track.current;
    if (!el) return;
    hold();
    const next = (Math.round(el.scrollLeft / el.clientWidth) + step + list.length) % list.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <section className="th-banners" aria-roledescription="carousel" aria-label="Promo">
      <h1 className="th-sr">{tenant.name}</h1>
      <div className="th-banners__track" ref={track} onScroll={onScroll} onPointerDown={hold} onTouchStart={hold}>
        {list.map((b, i) => {
          // eslint-disable-next-line @next/next/no-img-element
          const img = <img src={b.image_url} alt={b.title} className="th-banner__img" loading={i === 0 ? 'eager' : 'lazy'} />;
          const external = /^https?:\/\//.test(b.cta_url || '');
          return (
            <div key={b.id} className="th-banner" role="group" aria-roledescription="slide" aria-label={`${i + 1} dari ${list.length}`}>
              {b.cta_url ? (
                <a href={b.cta_url} className="th-banner__link" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {img}
                </a>
              ) : (
                img
              )}
            </div>
          );
        })}
      </div>
      {list.length > 1 && (
        <>
          <button type="button" className="th-banners__arrow th-banners__arrow--prev" aria-label="Banner sebelumnya" onClick={() => go(-1)}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="th-banners__arrow th-banners__arrow--next" aria-label="Banner berikutnya" onClick={() => go(1)}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </>
      )}
      {list.length > 1 && (
        <div className="th-dots" aria-hidden="true">
          {list.map((b, i) => (
            <span key={b.id} className={i === index ? 'th-dot th-dot--on' : 'th-dot'} />
          ))}
        </div>
      )}
    </section>
  );
};

/* ---------- Trust chips ---------- */
const TrustChips: React.FC<{ tenant: PublicTenantInfo }> = ({ tenant }) => {
  // The PPIU licence is in the header badge, so it is not repeated here.
  const chips = [
    tenant.trust_alumni_count?.trim() && { icon: <Users size={16} aria-hidden="true" />, text: `${tenant.trust_alumni_count.trim()} jamaah berangkat` },
    tenant.trust_rating?.trim() && { icon: <Star size={16} aria-hidden="true" />, text: `Rating ${tenant.trust_rating.trim()}` },
    tenant.trust_guarantee?.trim() && { icon: <BadgeCheck size={16} aria-hidden="true" />, text: tenant.trust_guarantee.trim() },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];
  if (chips.length === 0) return null;
  return (
    <ul className="th-trust" aria-label="Kenapa memilih kami">
      {chips.map((c) => (
        <li key={c.text} className="th-trust__chip">
          {c.icon}
          {c.text}
        </li>
      ))}
    </ul>
  );
};

/* ---------- Testimonials ---------- */
const Testimonials: React.FC<{ items: PublicTestimonialItem[] }> = ({ items }) => {
  if (items.length === 0) return null;
  const list = [...items].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  // Average of the travel's own published testimonials (no external rating is claimed).
  const avg = list.reduce((sum, t) => sum + t.rating, 0) / list.length;
  return (
    <section className="th-section" aria-labelledby="th-testi">
      <h2 id="th-testi" className="th-title">Cerita jamaah yang sudah berangkat</h2>
      <p className="th-sub th-sub--gap">
        Rata-rata {avg.toLocaleString('id-ID', { maximumFractionDigits: 1 })} dari 5 · {list.length} ulasan jamaah
      </p>
      <div className="th-testi">
        {list.map((t) => (
          <figure key={t.id} className="th-testi__card">
            <figcaption className="th-testi__who">
              {t.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.avatar_url} alt="" className="th-testi__avatar th-testi__avatar--img" loading="lazy" />
              ) : (
                <span className="th-testi__avatar" aria-hidden="true"><User size={18} /></span>
              )}
              <span className="th-testi__id">
                <b>{t.name}</b>
                <span>{[t.city, t.package_name, t.year].filter(Boolean).join(' · ')}</span>
              </span>
            </figcaption>
            <div className="th-testi__stars" aria-label={`Rating ${t.rating} dari 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} size={13} aria-hidden="true" className={i < t.rating ? 'th-star th-star--on' : 'th-star'} />
              ))}
            </div>
            <blockquote className="th-testi__quote">{t.quote}</blockquote>
          </figure>
        ))}
      </div>
    </section>
  );
};

/* ---------- FAQ ---------- */
const Faq: React.FC<{ items: PublicFAQItem[]; onAsk: () => void }> = ({ items, onAsk }) => {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;
  const list = [...items].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).slice(0, MAX_FAQ);
  return (
    <section className="th-section" aria-labelledby="th-faq">
      <h2 id="th-faq" className="th-title">Masih ragu? Ini jawabannya</h2>
      <div className="th-faq">
        {list.map((f) => (
          // One answer open at a time keeps the list short on a phone.
          <details
            key={f.id}
            className="th-faq__item"
            open={open === f.id}
            onToggle={(e) => {
              const isOpen = (e.currentTarget as HTMLDetailsElement).open;
              if (isOpen) setOpen(f.id);
              else if (open === f.id) setOpen(null);
            }}
          >
            <summary>
              <span>{f.question}</span>
              <ChevronDown size={16} aria-hidden="true" className="th-faq__chev" />
            </summary>
            <p>{f.answer}</p>
          </details>
        ))}
        <button type="button" className="th-faq__ask" onClick={onAsk}>
          <MessageCircle size={16} aria-hidden="true" />
          <span>Pertanyaan lain? Tanya langsung ke tim kami</span>
          <ChevronRight size={16} aria-hidden="true" className="th-faq__go" />
        </button>
      </div>
    </section>
  );
};
