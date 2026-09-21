'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './ScrollReveal.module.css';

export type ScrollRevealAnimation = 'fade-up' | 'fade-in' | 'scale-up' | 'slide-left' | 'slide-right';

export interface ScrollRevealProps {
  children: React.ReactNode;
  animation?: ScrollRevealAnimation;
  delay?: number;
  duration?: number;
  threshold?: number;
  rootMargin?: string;
  className?: string;
  style?: React.CSSProperties;
  as?: React.ElementType;
  once?: boolean;
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  animation = 'fade-up',
  delay = 0,
  duration = 650,
  threshold = 0.1,
  rootMargin = '0px 0px -40px 0px',
  className = '',
  style = {},
  as: Component = 'div',
  once = true,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const domRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = domRef.current;
    if (!el) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          if (once) {
            observer.unobserve(entry.target);
          }
        } else if (!once) {
          setIsRevealed(false);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, once]);

  const animationClass =
    animation === 'fade-up'
      ? styles.fadeUp
      : animation === 'fade-in'
      ? styles.fadeIn
      : animation === 'scale-up'
      ? styles.scaleUp
      : animation === 'slide-right'
      ? styles.slideRight
      : animation === 'slide-left'
      ? styles.slideLeft
      : styles.fadeUp;

  const combinedStyles: React.CSSProperties = {
    ...style,
    transitionDuration: `${duration}ms`,
    transitionDelay: `${delay}ms`,
  };

  return (
    <Component
      ref={domRef}
      className={`${styles.revealBase} ${animationClass} ${isRevealed ? styles.revealed : ''} ${className}`}
      style={combinedStyles}
    >
      {children}
    </Component>
  );
};
