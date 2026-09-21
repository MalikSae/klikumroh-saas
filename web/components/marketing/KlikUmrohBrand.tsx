import React from 'react';
import Image from 'next/image';
import styles from './KlikUmrohBrand.module.css';

export interface KlikUmrohBrandProps {
  theme?: 'light' | 'dark';
  showBadge?: boolean;
  iconSize?: number;
  className?: string;
}

export const KlikUmrohBrand: React.FC<KlikUmrohBrandProps> = ({
  theme = 'light',
  showBadge = true,
  iconSize = 30,
  className = '',
}) => {
  const isDark = theme === 'dark';

  return (
    <div className={`${styles.brandWrapper} ${isDark ? styles.brandDark : styles.brandLight} ${className}`}>
      {/* Icon Frame: Kotak Ka'bah & Kursor */}
      <div
        className={styles.iconFrame}
        style={{ width: iconSize, height: iconSize }}
      >
        <Image
          src="/icon-klikumroh.svg"
          alt="KlikUmroh"
          width={iconSize}
          height={iconSize}
          priority
          className={styles.iconImg}
        />
      </div>

      {/* Wordmark: Plus Jakarta Sans */}
      <div className={styles.textGroup}>
        <span className={styles.wordmark}>
          <span className={styles.wordmarkBold}>Klik</span>
          <span className={styles.wordmarkMuted}>Umroh</span>
        </span>
        {showBadge && (
          <span className={styles.badge}>.id</span>
        )}
      </div>
    </div>
  );
};
