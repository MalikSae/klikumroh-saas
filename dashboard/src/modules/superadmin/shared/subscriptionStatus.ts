// Label + tone for a travel's subscription status in the staff portal. The values are the derived
// `subscription_status` from the API (internal/repository/staff.go): active, pending, expired,
// suspended, no_plan, demo; falls back to the raw tenants.status (active/pending/inactive/...).
// Pure module (no React) so it can be unit tested with node.

export type StatusTone = 'green' | 'amber' | 'red' | 'neutral';

export interface SubscriptionStatusView {
  key: string;
  label: string;
  tone: StatusTone;
}

const VIEWS: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: 'Aktif', tone: 'green' },
  pending: { label: 'Pending', tone: 'amber' },
  trial: { label: 'Trial', tone: 'amber' },
  expired: { label: 'Kedaluwarsa', tone: 'red' },
  suspended: { label: 'Ditangguhkan', tone: 'red' },
  inactive: { label: 'Nonaktif', tone: 'red' },
  no_plan: { label: 'Tanpa Paket', tone: 'neutral' },
  demo: { label: 'Demo', tone: 'neutral' },
};

/** Prefers the derived subscription_status; falls back to the raw status, then 'trial'. */
export function subscriptionStatusView(
  subscriptionStatus?: string | null,
  rawStatus?: string | null,
): SubscriptionStatusView {
  const key = (subscriptionStatus || rawStatus || 'trial').trim().toLowerCase();
  const view = VIEWS[key];
  if (view) return { key, ...view };
  return { key, label: key, tone: 'neutral' };
}
