'use client';

// Habit streak badge (3 Oct 2026): earned once at 7, 30 and 100 active days in a row ("istiqamah").
// Recognition only, no prize. Bronze, silver and gold like the leaderboard medals.
// "chip" shows icon and name (Kebiasaan, profile ID card); "icon" is the icon alone with a label for
// screen readers (leaderboard rows).
import React from 'react';
import { Award } from 'lucide-react';
import './HabitBadge.css';

export const HABIT_BADGE_MILESTONES = [7, 30, 100] as const;

export const habitBadgeName = (days: number) => `Istiqamah ${days} Hari`;

const tier = (days: number) => (days >= 100 ? 'gold' : days >= 30 ? 'silver' : 'bronze');

export const HabitBadge: React.FC<{ days: number; variant?: 'chip' | 'icon'; size?: number; className?: string }> = ({
  days,
  variant = 'chip',
  size,
  className,
}) => {
  if (!days) return null;
  const cls = `tw-habit-badge tw-habit-badge--${tier(days)} tw-habit-badge--${variant}${className ? ` ${className}` : ''}`;
  if (variant === 'icon') {
    return (
      <span className={cls} role="img" aria-label={`Lencana ${habitBadgeName(days)}`} title={habitBadgeName(days)}>
        <Award size={size ?? 16} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={cls}>
      <Award size={size ?? 16} aria-hidden="true" />
      {habitBadgeName(days)}
    </span>
  );
};
