'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User, Star, Quote } from 'lucide-react';
import './TestimonialSection.css';

export interface PublicTestimonialItem {
  id: number;
  name: string;
  city?: string | null;
  package_name?: string | null;
  year?: string | null;
  rating: number;
  quote: string;
  avatar_url?: string | null;
  display_order?: number;
}

export interface TestimonialSectionProps {
  testimonials?: PublicTestimonialItem[];
}

const DEFAULT_TESTIMONIALS: PublicTestimonialItem[] = [
  {
    id: 1,
    name: 'H. Bambang Sugiarto',
    package_name: 'Alumni Umroh Syawal 1447H',
    rating: 5,
    quote: 'Alhamdulillah pelayanan sangat memuaskan, hotel benar-benar dekat ke pelataran masjid sehingga orang tua tidak kelelahan saat berangkat sholat.',
  },
  {
    id: 2,
    name: 'Hj. Nurul Aini',
    package_name: 'Alumni Umroh VIP Bintang 5',
    rating: 5,
    quote: 'Bimbingan muthawif sangat sabar dan mendalam. Itinerary tertata rapi, makanan menu nusantara cocok di lidah seluruh keluarga.',
  },
  {
    id: 3,
    name: 'Ahmad Fauzi & Keluarga',
    package_name: 'Alumni Umroh Liburan',
    rating: 5,
    quote: 'Proses visa dan administrasi dibantu dari awal sampai tuntas. Tidak ada biaya siluman, sangat amanah dan profesional.',
  },
];

export const TestimonialSection: React.FC<TestimonialSectionProps> = ({ testimonials = [] }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  const activeTestimonials = testimonials.length > 0 ? testimonials : DEFAULT_TESTIMONIALS;

  useEffect(() => {
    if (activeTestimonials.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeTestimonials.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [activeTestimonials.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || activeTestimonials.length <= 1) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    touchStartXRef.current = null;

    if (diff > 40) {
      setCurrentSlide((prev) => (prev + 1) % activeTestimonials.length);
    } else if (diff < -40) {
      setCurrentSlide((prev) => (prev - 1 + activeTestimonials.length) % activeTestimonials.length);
    }
  };

  const formatSubtitle = (testi: PublicTestimonialItem) => {
    const parts = [];
    if (testi.package_name) parts.push(testi.package_name);
    if (testi.city) parts.push(testi.city);
    if (testi.year) parts.push(`(${testi.year})`);
    return parts.length > 0 ? parts.join(' • ') : 'Alumni Jamaah';
  };

  return (
    <section id="testimoni" className="tw-testimonials">
      <div className="tw-testimonials__header">
        <span className="tw-testimonials__tag">Pengalaman Nyata</span>
        <h2 className="tw-testimonials__title">Apa Kata Jamaah Kami?</h2>
      </div>

      <div
        className="tw-testimonials__carousel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="tw-testimonials__track"
          style={{
            transform: `translateX(-${currentSlide * 100}%)`,
          }}
        >
          {activeTestimonials.map((testi, idx) => {
            const isActive = idx === currentSlide;
            const subtitle = formatSubtitle(testi);

            return (
              <div
                key={testi.id}
                className={`tw-testimonials__slide ${isActive ? 'tw-testimonials__slide--active' : ''}`}
              >
                <div className="tw-testi-card">
                  <Quote size={64} className="tw-testi-card__watermark" />

                  <div className="tw-testi-card__header">
                    <div className="tw-testi-card__avatar">
                      {testi.avatar_url ? (
                        <img
                          src={testi.avatar_url}
                          alt={testi.name}
                          className="tw-testi-card__avatar-img"
                        />
                      ) : (
                        <User size={20} />
                      )}
                    </div>
                    <div className="tw-testi-card__info">
                      <div className="tw-testi-card__name-row">
                        <span className="tw-testi-card__name">{testi.name}</span>
                      </div>
                      <span className="tw-testi-card__package">{subtitle}</span>
                    </div>
                  </div>

                  <div className="tw-testi-card__stars">
                    {[...Array(testi.rating || 5)].map((_, i) => (
                      <Star key={i} size={14} fill="currentColor" />
                    ))}
                  </div>

                  <p className="tw-testi-card__quote">
                    &ldquo;{testi.quote}&rdquo;
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {activeTestimonials.length > 1 && (
        <div className="tw-testimonials__dots">
          {activeTestimonials.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              className={`tw-testimonials__dot ${idx === currentSlide ? 'tw-testimonials__dot--active' : ''}`}
              onClick={() => setCurrentSlide(idx)}
              aria-label={`Testimoni ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
