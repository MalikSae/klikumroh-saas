// Indonesian label + tone for raw status values shown in the staff portal. Pure module (no React, no
// imports) so it can be unit tested with node. Tones map to the existing sa-pill / sa-badge classes.
import type { StatusTone } from './subscriptionStatus.ts';

export interface StatusView {
  label: string;
  tone: StatusTone;
}

// admin_users.status: ENUM('active','inactive').
const ADMIN: Record<string, StatusView> = {
  active: { label: 'Aktif', tone: 'green' },
  inactive: { label: 'Nonaktif', tone: 'neutral' },
};

export const adminStatusView = (status?: string | null): StatusView => {
  const key = (status || 'active').trim().toLowerCase();
  return ADMIN[key] ?? { label: key, tone: 'neutral' };
};

// domains.status: ENUM('pending','active','failed').
const DOMAIN: Record<string, StatusView> = {
  active: { label: 'Aktif', tone: 'green' },
  pending: { label: 'Menunggu verifikasi', tone: 'amber' },
  failed: { label: 'Gagal verifikasi', tone: 'red' },
};

export const domainStatusView = (status?: string | null): StatusView => {
  if (!status) return { label: 'Subdomain aktif', tone: 'neutral' };
  const key = status.trim().toLowerCase();
  return DOMAIN[key] ?? { label: key, tone: 'neutral' };
};

/** Calendar date (YYYY-MM-DD) of an instant in WIB. */
const dateInWIB = (d: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta' }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export type CouponState = 'active' | 'expired' | 'inactive';

/**
 * Same rule as the backend (couponEndOfDay in internal/service/coupon.go): a coupon is valid through the
 * end of its expiry day in WIB, so it counts as expired only once that WIB day is over.
 */
export const couponState = (status: string, expiresAt: string | null | undefined, now: Date = new Date()): CouponState => {
  if (status !== 'active') return 'inactive';
  if (!expiresAt) return 'active';
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return 'active';
  return dateInWIB(now) > dateInWIB(exp) ? 'expired' : 'active';
};
