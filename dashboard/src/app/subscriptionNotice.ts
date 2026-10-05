import type { TenantSubscriptionInfo } from '../services/api';

export interface SubscriptionNotice {
  tone: 'warning' | 'danger' | 'accent';
  title: string;
  text: string;
  action: string;
  to: string;
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '';

/**
 * The single most urgent subscription message, or null when nothing needs the admin: unpaid activation,
 * suspended, grace period, then the renewal reminder from 30 days before expiry.
 */
export function subscriptionNotice(info: TenantSubscriptionInfo | null): SubscriptionNotice | null {
  if (!info) return null;
  const pending = info.pending_verification;
  const payLink = pending ? `/settings/subscription/payment/${pending.id}` : null;

  if (info.status === 'pending') {
    const rejected = !pending ? info.payment_verifications?.find((p) => p.status === 'rejected') : undefined;
    if (rejected) {
      return { tone: 'danger', title: 'Pembayaran aktivasi perlu diperbaiki', text: rejected.rejection_reason || 'Bukti transfer belum sesuai.', action: 'Perbaiki pembayaran', to: `/settings/subscription/payment/${rejected.id}` };
    }
    return pending?.proof_url
      ? { tone: 'warning', title: 'Pembayaran sedang diverifikasi', text: 'Website travel aktif setelah tim KlikUmroh menyetujui bukti transfer.', action: 'Lihat tagihan', to: payLink || '/settings/subscription' }
      : { tone: 'warning', title: 'Selesaikan pembayaran aktivasi', text: 'Website travel aktif setelah pembayaran diverifikasi.', action: 'Lihat cara bayar', to: payLink || '/settings/subscription' };
  }
  if (info.is_suspended) {
    return { tone: 'danger', title: 'Layanan ditangguhkan', text: 'Website travel tidak tampil dan data hanya bisa dilihat.', action: payLink ? 'Selesaikan pembayaran' : 'Perpanjang langganan', to: payLink || '/settings/subscription' };
  }
  if (info.is_subscription_expired) {
    return { tone: 'warning', title: `Masa aktif berakhir ${fmt(info.subscription_expires_at)}`, text: `Layanan tetap berjalan ${info.grace_period_days_remaining} hari lagi, setelah itu website ditangguhkan.`, action: payLink ? 'Selesaikan pembayaran' : 'Perpanjang langganan', to: payLink || '/settings/subscription' };
  }
  if (info.should_show_renewal_invoice && info.days_remaining > 0) {
    return { tone: info.days_remaining <= 7 ? 'warning' : 'accent', title: `Langganan berakhir dalam ${info.days_remaining} hari`, text: `Masa aktif sampai ${fmt(info.subscription_expires_at)}.`, action: payLink ? 'Selesaikan pembayaran' : 'Perpanjang', to: payLink || '/settings/subscription' };
  }
  return null;
}
