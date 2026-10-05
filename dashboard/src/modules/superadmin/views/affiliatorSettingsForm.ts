// Affiliator program settings form (staff). Fields are kept as typed text so a cleared field stays empty
// and is reported on save, instead of silently saving 0% commission, 0 hold days or a 0 minimum.
// Bounds mirror UpdateSettings in internal/service/affiliator.go.
import { parsePercent, parseWholeNumber } from '../../../screens/programs/numberInput.ts';

export type AffiliatorSettingsValues = {
  first_rate: number;
  renewal_rate: number;
  coupon_discount: number;
  hold_days: number;
  min_payout: number;
};

export type AffiliatorSettingsDraft = Record<keyof AffiliatorSettingsValues, string>;

export const toAffiliatorDraft = (s: AffiliatorSettingsValues): AffiliatorSettingsDraft => ({
  first_rate: String(s.first_rate),
  renewal_rate: String(s.renewal_rate),
  coupon_discount: String(s.coupon_discount),
  hold_days: String(s.hold_days),
  min_payout: String(s.min_payout),
});

/** Parsed values, or the first problem as an Indonesian message. */
export const parseAffiliatorDraft = (
  d: AffiliatorSettingsDraft,
): { ok: true; value: AffiliatorSettingsValues } | { ok: false; error: string } => {
  const pct = (v: string, label: string, min: number, minInclusive: boolean) => {
    if (v.trim() === '') return `${label} wajib diisi.`;
    const n = parsePercent(v);
    if (n === null || n > 100 || (minInclusive ? n < min : n <= min)) return `${label} harus ${minInclusive ? `${min}` : `lebih dari ${min}`} sampai 100.`;
    return n;
  };
  const first = pct(d.first_rate, 'Komisi pembayaran pertama', 0, true);
  if (typeof first === 'string') return { ok: false, error: first };
  const renewal = pct(d.renewal_rate, 'Komisi perpanjangan', 0, true);
  if (typeof renewal === 'string') return { ok: false, error: renewal };
  const coupon = pct(d.coupon_discount, 'Diskon kupon affiliator', 0, false);
  if (typeof coupon === 'string') return { ok: false, error: coupon };
  if (d.hold_days.trim() === '') return { ok: false, error: 'Masa tahan komisi wajib diisi.' };
  const hold = parseWholeNumber(d.hold_days, 0, 365);
  if (hold === null) return { ok: false, error: 'Masa tahan komisi harus angka bulat 0 sampai 365 hari.' };
  if (d.min_payout.trim() === '') return { ok: false, error: 'Minimal pencairan wajib diisi.' };
  const min = parseWholeNumber(d.min_payout, 0);
  if (min === null) return { ok: false, error: 'Minimal pencairan harus angka bulat, tanpa titik.' };
  return { ok: true, value: { first_rate: first, renewal_rate: renewal, coupon_discount: coupon, hold_days: hold, min_payout: min } };
};
