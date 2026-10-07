// Pure plan display helpers (no imports), shared by the landing, the checkout and their tests.

export interface ApiPricingPlan {
  id: number;
  name: string;
  period_months: number;
  price: number;
  /** Promo for a new travel's first payment (founder decision 7 Oct 2026). */
  promo_percent?: number | null;
  promo_ends_at?: string | null;
  promo_active?: boolean;
  promo_price?: number | null;
}

export interface PlanTier {
  id: number;
  name: string;
  periodMonths: number;
  /** Normal price. */
  price: number;
  /** Per month of the price a new travel pays (the promo price when a promo is on). */
  monthlyEquivalent: number;
  discountLabel?: string;
  discountBadge?: string;
  popular?: boolean;
  /** Promo in force: percent, price after it, and its last day (YYYY-MM-DD, null = no end date). */
  promoPercent?: number;
  promoPrice?: number;
  promoEndsAt?: string | null;
}

/** Price a new travel pays for a plan: the promo price when a promo is on. */
export const payablePrice = (plan: { price: number; promoPrice?: number }): number => plan.promoPrice ?? plan.price;

/** "2026-12-31" -> "31 Des 2026". */
export const formatPromoDay = (d: string): string =>
  new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

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

    const promoOn = Boolean(p.promo_active && p.promo_percent && p.promo_price != null);
    return {
      id: p.id,
      name: p.name.toLowerCase().startsWith('paket') ? p.name : `Paket ${p.name}`,
      periodMonths: p.months,
      price: p.price,
      monthlyEquivalent: promoOn ? Math.round((p.promo_price as number) / p.months) : p.monthly,
      discountLabel: label,
      discountBadge: badge,
      popular,
      ...(promoOn ? { promoPercent: p.promo_percent as number, promoPrice: p.promo_price as number, promoEndsAt: p.promo_ends_at ?? null } : {}),
    };
  });
}
