// Subscription plans as configured by the super admin (GET /api/public/pricing-plans).
// Server pages fetch them with ISR so the initial HTML already shows real prices (no hardcoded fallback).

export interface ApiPricingPlan {
  id: number;
  name: string;
  period_months: number;
  price: number;
}

export interface PlanTier {
  id: number;
  name: string;
  periodMonths: number;
  price: number;
  monthlyEquivalent: number;
  discountLabel?: string;
  discountBadge?: string;
  popular?: boolean;
}

const getBackendBaseUrl = (): string =>
  process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8080';

/** Server-side fetch, cached for 5 minutes. Returns [] when the API is unreachable. */
export async function fetchPricingPlans(): Promise<ApiPricingPlan[]> {
  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/public/pricing-plans`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.plans) ? data.plans : [];
  } catch {
    return [];
  }
}

/** Maps API plans to display tiers; savings badges are computed against the 3-month plan of the SAME list. */
export function toPlanTiers(plans: ApiPricingPlan[]): PlanTier[] {
  const withMonthly = plans.map((p) => {
    const months = p.period_months || 1;
    return { ...p, months, monthly: Math.round(p.price / months) };
  });
  const base = withMonthly.find((p) => p.months === 3);

  return withMonthly.map((p) => {
    let label = 'FLEKSIBEL';
    let popular = false;
    if (p.months === 6) {
      label = 'PALING POPULER';
      popular = true;
    } else if (p.months >= 12) {
      label = 'PALING HEMAT';
    }

    let badge: string | undefined;
    if (base && p.months !== 3 && base.monthly > 0) {
      const savings = Math.round(((base.monthly - p.monthly) / base.monthly) * 100);
      badge = savings > 0 ? `Hemat ${savings}%` : undefined;
    }

    return {
      id: p.id,
      name: p.name.toLowerCase().startsWith('paket') ? p.name : `Paket ${p.name}`,
      periodMonths: p.months,
      price: p.price,
      monthlyEquivalent: p.monthly,
      discountLabel: label,
      discountBadge: badge,
      popular,
    };
  });
}
