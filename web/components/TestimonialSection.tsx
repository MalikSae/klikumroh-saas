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

// Only the travel's own testimonials are shown (Website > Testimoni in the dashboard). With none, the
// section is hidden: never sample reviews under made-up names.
export const TestimonialSection: React.FC<TestimonialSectionProps> = ({ testimonials = [] }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  const activeTestimonials = testimonials;

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
    return parts.join(' • ');
  };

  if (activeTestimonials.length === 0) return null;

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
                      {subtitle && <span className="tw-testi-card__package">{subtitle}</span>}
                    </div>
                  </div>

                  <div className="tw-testi-card__stars">
                    {[...Array(Math.min(5, Math.max(0, Math.round(testi.rating || 0))))].map((_, i) => (
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
