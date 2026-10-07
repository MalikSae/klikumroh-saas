import { backendFetch } from './backendFetch';
import type { ApiPricingPlan } from './planTiers';

export { formatPromoDay, payablePrice, toPlanTiers, type ApiPricingPlan, type PlanTier } from './planTiers';

// Subscription plans as configured by the super admin (GET /api/public/pricing-plans).
// Server pages fetch them with ISR so the initial HTML already shows real prices (no hardcoded fallback).

const getBackendBaseUrl = (): string =>
  process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8080';

/** Server-side fetch, cached for 5 minutes. Returns [] when the API is unreachable. */
export async function fetchPricingPlans(): Promise<ApiPricingPlan[]> {
  try {
    const res = await backendFetch(`${getBackendBaseUrl()}/api/public/pricing-plans`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.plans) ? data.plans : [];
  } catch {
    return [];
  }
}
