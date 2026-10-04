'use client';

import { useEffect, useRef } from 'react';
import styles from './MarketingV3View.module.css';

export function MarketingPixelPattern() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const tokens = getComputedStyle(canvas);
    const number = (name: string) => parseFloat(tokens.getPropertyValue(name));
    const pitch = number('--km-v3-pattern-pitch');
    const size = number('--km-v3-pattern-square-size');
    const cycle = number('--km-v3-pattern-cycle-duration');
    const minimum = number('--km-v3-pattern-minimum-opacity');
    const frameInterval = 1000 / number('--km-v3-pattern-fps');
    const color = tokens.getPropertyValue('--km-v3-pattern-color').trim();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let visible = false;
    let frame = 0;
    let lastPaint = 0;

    const paint = (time: number) => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      for (let y = 0, row = 0; y < height; y += pitch, row++) {
        for (let x = 0, column = 0; x < width; x += pitch, column++) {
          const seed = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;
          const phase = seed - Math.floor(seed);
          const wave = (Math.sin(time / cycle * Math.PI * 2 * (0.7 + phase) + phase * Math.PI * 2) + 1) / 2;
          context.globalAlpha = minimum + wave * (1 - minimum);
          context.fillRect(x, y, size, size);
        }
      }
      context.globalAlpha = 1;
    };

    const tick = (time: number) => {
      if (!visible || motion.matches) return;
      if (time - lastPaint >= frameInterval) {
        paint(time);
        lastPaint = time;
      }
      frame = requestAnimationFrame(tick);
    };

    const syncMotion = () => {
      cancelAnimationFrame(frame);
      if (motion.matches) paint(0);
      else if (visible) frame = requestAnimationFrame(tick);
    };

    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint(motion.matches ? 0 : performance.now());
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncMotion();
    });
    resize.observe(canvas);
    intersection.observe(canvas);
    motion.addEventListener('change', syncMotion);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      motion.removeEventListener('change', syncMotion);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.patternCanvas} aria-hidden="true" />;
}
