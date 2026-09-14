'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import './HeroCarousel.css';

export interface PublicBannerItem {
  id: number;
  title: string;
  subtitle?: string | null;
  image_url: string;
  badge_text?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  display_order?: number;
}

export interface HeroCarouselProps {
  banners?: PublicBannerItem[];
}

const PLACEHOLDER_SLIDES: PublicBannerItem[] = [
  { id: 1, title: 'Banner Promo 1', subtitle: 'Informasi penawaran terbaik untuk ibadah umroh Anda', image_url: '', cta_url: null, badge_text: null, cta_text: null },
  { id: 2, title: 'Banner Promo 2', subtitle: 'Pilihan paket istimewa dengan fasilitas hotel terbaik', image_url: '', cta_url: null, badge_text: null, cta_text: null },
  { id: 3, title: 'Banner Promo 3', subtitle: 'Bimbingan ibadah terpercaya sesuai sunnah', image_url: '', cta_url: null, badge_text: null, cta_text: null },
];

export const HeroCarousel: React.FC<HeroCarouselProps> = ({ banners = [] }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  const activeSlides = banners.length > 0 ? banners : PLACEHOLDER_SLIDES;

  useEffect(() => {
    if (activeSlides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [activeSlides.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || activeSlides.length <= 1) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    touchStartXRef.current = null;

    if (diff > 40) {
      setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
    } else if (diff < -40) {
      setCurrentSlide((prev) => (prev - 1 + activeSlides.length) % activeSlides.length);
    }
  };

  const handleSlideClick = (slide: { cta_url?: string | null }) => {
    if (slide.cta_url) {
      if (slide.cta_url.startsWith('http')) {
        window.open(slide.cta_url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = slide.cta_url;
      }
    }
  };

  return (
    <div className="tw-hero-carousel-wrap">
      <div
        className="tw-hero-carousel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="tw-hero-carousel__track"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {activeSlides.map((slide) => {
            const hasImage = 'image_url' in slide && Boolean(slide.image_url);
            const banner = slide as PublicBannerItem;

            return (
              <div
                key={slide.id}
                className="tw-hero-slide"
                onClick={() => handleSlideClick(slide)}
                role={'cta_url' in slide && slide.cta_url ? 'button' : undefined}
                tabIndex={'cta_url' in slide && slide.cta_url ? 0 : undefined}
              >
                {hasImage ? (
                  <img
                    src={banner.image_url}
                    alt={banner.title}
                    className="tw-hero-slide__image"
                    loading="lazy"
                  />
                ) : (
                  <div className="tw-hero-slide__placeholder">
                    <div className="tw-hero-slide__placeholder-icon">
                      <ImageIcon size={44} />
                    </div>
                    <span className="tw-hero-slide__placeholder-label">{slide.title}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {activeSlides.length > 1 && (
          <div className="tw-hero-carousel__dots">
            {activeSlides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                className={`tw-hero-carousel__dot ${idx === currentSlide ? 'tw-hero-carousel__dot--active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
