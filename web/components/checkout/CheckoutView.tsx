'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { capitalizeName } from '@/lib/personName';
import Link from 'next/link';
import { Instrument_Serif } from 'next/font/google';
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  Check,
  Tag,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Database,
  Clock,
  Headset,
  ChevronDown,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { KlikUmrohBrand } from '@/components/marketing/KlikUmrohBrand';
import { usePlatformSettings, hasLegalDocuments } from '@/lib/usePlatformSettings';
import { formatPromoDay, payablePrice, toPlanTiers, type PlanTier } from '@/lib/pricingPlans';
import { validateWhatsApp } from '@/lib/signupWhatsApp';
import { discountedPrice } from '@/lib/checkoutPricing';
import { slugCheckOutcome, couponErrorMessage } from '@/lib/checkoutChecks';
import {
  dashboardUrl,
  openDashboard,
  storeDashboardSession,
} from '@/lib/dashboardSession';
import { newPasswordError } from '../../lib/passwordRules';
import { readJsonSafe, apiErrorMessage } from '@/lib/safeJson';
import {
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  slugifyTravelName,
  isCouponFieldOpen,
  showCouponBreakdown,
  formatRupiah,
  billingPeriodNote,
} from '@/lib/checkoutForm';
import styles from './CheckoutView.module.css';

// Display serif of the klikumroh.id marketing site (same font and variable as MarketingV3View), used
// for the page title only so the checkout reads as part of the same site.
const serif = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--km-font-display', display: 'swap' });

// ─── Types ─────────────────────────────────────────────────────────────────

interface PricingPlan {
  id: number;
  name: string;
  period_months: number;
  price: number;
  monthly_equivalent: number;
  discount_label?: string;
  discount_badge?: string;
  popular?: boolean;
  /** Plan promo for a new travel (founder decision 7 Oct 2026): price after it and its last day. */
  promoPercent?: number;
  promoPrice?: number;
  promoEndsAt?: string | null;
}

interface CouponResult {
  code: string;
  discount_percentage: number;
  plan_id?: number;
  validatedForPlanId: number; // the plan the code was checked against
}

interface FormErrors {
  travel_name?: string;
  slug?: string;
  admin_name?: string;
  admin_whatsapp?: string;
  admin_email?: string;
  admin_password?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const INCLUDED_FEATURES = [
  'Website travel dan form minat',
  'Dashboard prospek dan komisi',
  'Portal agen dan materi promosi',
  'Jumlah agen tidak dibatasi',
];

// Signup steps shown above the form; the checkout is step 1, payment happens on the next page.
const SIGNUP_STEPS = ['Data travel', 'Pembayaran', 'Aktif'];

// ─── Format Validations ───────────────────────────────────────────────────

export { validateWhatsApp };

export function validateEmail(val: string): string | undefined {
  const trimmed = val.trim().toLowerCase();
  if (!trimmed) {
    return 'Email wajib diisi';
  }

  // Strict email regex: user@domain.tld
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) {
    return 'Format email tidak valid (contoh: nama@travel.com)';
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return 'Format email tidak valid';
  }
  const domainParts = parts[1].split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return 'Domain email tidak valid (contoh: .com, .id, .co.id)';
  }

  return undefined;
}

function validateForm(
  travelName: string,
  slug: string,
  adminName: string,
  adminWhatsApp: string,
  adminEmail: string,
  adminPassword: string,
): FormErrors {
  const errs: FormErrors = {};

  if (!travelName.trim() || travelName.trim().length < 2)
    errs.travel_name = 'Nama travel minimal 2 karakter';

  if (!slug.trim() || slug.trim().length < SLUG_MIN_LENGTH)
    errs.slug = `Subdomain minimal ${SLUG_MIN_LENGTH} karakter`;
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.trim()))
    errs.slug = 'Hanya huruf kecil, angka, dan tanda hubung (-)';

  if (!adminName.trim() || adminName.trim().length < 2)
    errs.admin_name = 'Nama PIC minimal 2 karakter';

  const waErr = validateWhatsApp(adminWhatsApp);
  if (waErr) errs.admin_whatsapp = waErr;

  const emailErr = validateEmail(adminEmail);
  if (emailErr) errs.admin_email = emailErr;

  // Sent as typed (never trimmed); spaces at the ends do not count towards the minimum.
  const pwErr = newPasswordError(adminPassword);
  if (pwErr) errs.admin_password = pwErr;

  return errs;
}

// ─── Plan chooser (shared by the summary and the mobile compact summary line) ───

interface PlanChooserProps {
  id: string;
  plans: PricingPlan[];
  selectedPlan: PricingPlan;
  onPlanChange: (plan: PricingPlan) => void;
  onClose: () => void;
  disabled: boolean;
}

const PlanChooser: React.FC<PlanChooserProps> = ({ id, plans, selectedPlan, onPlanChange, onClose, disabled }) => (
  <div id={id} className={styles.planAccordion}>
    <div className={styles.planAccordionList}>
      {plans.map((plan) => {
        const isSelected = plan.id === selectedPlan.id;
        return (
          <button
            key={plan.id}
            type="button"
            className={`${styles.planAccordionOption} ${isSelected ? styles.planAccordionOptionSelected : ''}`}
            onClick={() => {
              onPlanChange(plan);
              onClose();
            }}
            // No plan change while a coupon is being checked for the current plan.
            disabled={disabled}
            aria-pressed={isSelected}
          >
            <div className={styles.planOptionRadioCircle}>
              {isSelected && <div className={styles.planOptionRadioDot} />}
            </div>
            <div className={styles.planOptionInfo}>
              <div className={styles.planOptionTop}>
                <span className={styles.planOptionTitle}>{plan.name}</span>
                {plan.popular && <span className={styles.planOptionPopularTag}>Direkomendasikan</span>}
                {plan.promoPercent ? (
                  <span className={styles.planOptionDiscountTag}>Promo {plan.promoPercent}%</span>
                ) : plan.discount_badge && !plan.popular && (
                  <span className={styles.planOptionDiscountTag}>{plan.discount_badge}</span>
                )}
              </div>
              <div className={styles.planOptionPrice}>
                <span>{formatRupiah(plan.monthly_equivalent)}/bln</span>
                <span className={styles.planOptionTotal}>(Total {formatRupiah(payablePrice(plan))})</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Order Summary subcomponent ────────────────────────────────────────────

interface OrderSummaryProps {
  selectedPlan: PricingPlan;
  plans: PricingPlan[];
  onPlanChange: (plan: PricingPlan) => void;
  coupon: CouponResult | null;
  couponCode: string;
  onCouponCodeChange: (val: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  couponLoading: boolean;
  couponError: string | null;
  planChooserOpen: boolean;
  onTogglePlanChooser: () => void;
  onClosePlanChooser: () => void;
}

const OrderSummary: React.FC<OrderSummaryProps> = ({
  selectedPlan,
  plans,
  onPlanChange,
  coupon,
  couponCode,
  onCouponCodeChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponLoading,
  couponError,
  planChooserOpen,
  onTogglePlanChooser,
  onClosePlanChooser,
}) => {
  const [couponOpened, setCouponOpened] = useState(false);
  // Same rounding as the backend invoice.
  // The plan promo comes off first, then the coupon from the promo price (backend public_signup.go).
  const payable = payablePrice(selectedPlan);
  const promoCut = selectedPlan.price - payable;
  const { discount, finalAmount } = discountedPrice(payable, coupon ? coupon.discount_percentage : 0);
  const breakdown = showCouponBreakdown(!!coupon) || promoCut > 0;
  const couponOpen = isCouponFieldOpen({ opened: couponOpened, couponApplied: !!coupon, couponError, couponCode });

  return (
    <aside className={styles.summaryColumn} aria-label="Ringkasan Pesanan">
      {/* Order Summary Card */}
      <div className={styles.summaryCard}>
        {/* Header */}
        <div className={styles.summaryHeader}>
          <div className={styles.summaryTitleGroup}>
            <span className={styles.summaryEyebrow}>Paket langganan Anda</span>
            <div className={styles.planTitleRow}>
              <h2 className={styles.selectedPlanTitle}>{selectedPlan.name}</h2>
              {selectedPlan.popular && (
                <div className={styles.popularBadge}>
                  <span className={styles.popularBadgeText}>DIREKOMENDASIKAN</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selected Plan Price with Ubah Paket Button */}
        <div className={styles.priceBlock}>
          <div className={styles.priceRow}>
            <div className={styles.priceMain}>
              <span className={styles.monthlyPrice}>{formatRupiah(selectedPlan.monthly_equivalent)}</span>
              <span className={styles.perMonth}>/bln</span>
            </div>

            {plans.length > 1 && (
              <button
                type="button"
                id="change-plan-toggle-btn"
                // Two-column layout only; in the single-column layout the compact line's "Ubah" changes the plan.
                className={`${styles.changePlanBtn} ${styles.summaryChangePlanBtn}`}
                onClick={onTogglePlanChooser}
                aria-expanded={planChooserOpen}
                aria-controls="plan-accordion-options"
              >
                <span>Ubah Paket</span>
                <ChevronDown
                  size={14}
                  className={`${styles.changePlanChevron} ${planChooserOpen ? styles.changePlanChevronOpen : ''}`}
                />
              </button>
            )}
          </div>
          {/* Billing period under the monthly price (the amount itself appears once, in the total) */}
          <p className={styles.billingNote}>{billingPeriodNote(selectedPlan.period_months)}</p>
          {selectedPlan.promoPercent ? (
            <p className={styles.promoNote}>
              Promo {selectedPlan.promoPercent}% untuk travel baru{selectedPlan.promoEndsAt ? `, sampai ${formatPromoDay(selectedPlan.promoEndsAt)}` : ''}. Perpanjangan memakai harga normal.
            </p>
          ) : null}

          {/* Accordion: Opsi Pilihan Paket */}
          {planChooserOpen && plans.length > 1 && (
            <div className={styles.summaryPlanChooser}>
              <PlanChooser
                id="plan-accordion-options"
                plans={plans}
                selectedPlan={selectedPlan}
                onPlanChange={onPlanChange}
                onClose={onClosePlanChooser}
                disabled={couponLoading}
              />
            </div>
          )}
        </div>

        <div className={styles.summaryDivider} />

        {/* Included Features */}
        <ul className={styles.featuresList}>
          {INCLUDED_FEATURES.map((feat) => (
            <li key={feat} className={styles.featureItem}>
              <Check size={15} className={styles.featureCheck} strokeWidth={2.5} />
              <span className={styles.featureText}>{feat}</span>
            </li>
          ))}
        </ul>

        {/* Coupon Section: collapsed behind a link until opened, applied, or showing an error */}
        <div className={styles.couponSection}>
          {!couponOpen ? (
            <button
              type="button"
              id="coupon-toggle-btn"
              className={styles.couponToggle}
              onClick={() => {
                setCouponOpened(true);
                // Move focus into the field that just opened.
                requestAnimationFrame(() => document.getElementById('coupon-input')?.focus());
              }}
              aria-expanded={false}
              aria-controls="coupon-field"
            >
              <Tag size={15} className={styles.couponToggleIcon} />
              <span>Punya kode kupon?</span>
            </button>
          ) : (
            <div id="coupon-field" className={styles.couponField}>
              {coupon ? (
                // Applied: one compact line (code, saving, remove action) instead of a disabled input.
                <div className={styles.couponApplied}>
                  <Tag size={15} className={styles.couponIcon} aria-hidden="true" />
                  <span className={styles.couponAppliedText}>
                    <span className={styles.couponAppliedCode}>{coupon.code}</span>{' '}
                    <span className={styles.couponSuccess}>hemat {coupon.discount_percentage}%</span>
                  </span>
                  <button
                    type="button"
                    id="remove-coupon-btn"
                    className={styles.couponRemoveBtn}
                    // The coupon can be removed, then another code entered (totals follow the coupon state).
                    onClick={onRemoveCoupon}
                    aria-label="Hapus kupon"
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="coupon-input" className={styles.couponLabel}>
                    Kode kupon
                  </label>
                  <div className={styles.couponRow}>
                    <div className={styles.couponInputContainer}>
                      <Tag size={15} className={styles.couponIcon} />
                      <input
                        id="coupon-input"
                        type="text"
                        className={styles.couponInputField}
                        placeholder="Masukkan kode"
                        value={couponCode}
                        onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
                        disabled={couponLoading}
                        maxLength={20}
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      id="apply-coupon-btn"
                      className={styles.applyCouponBtn}
                      onClick={onApplyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                    >
                      {couponLoading ? <Loader2 size={14} className={styles.spinner} /> : 'Pakai'}
                    </button>
                  </div>
                </>
              )}
              {couponError && (
                <span className={`${styles.couponStatusMessage} ${styles.couponError}`}>{couponError}</span>
              )}
            </div>
          )}
        </div>

        <div className={styles.summaryDivider} />

        {/* Order Totals */}
        <div className={styles.orderTotals}>
          {/* Subtotal and Diskon only with a coupon; otherwise the total alone */}
          {breakdown && (
            <>
              <div className={styles.totalRow}>
                <span className={styles.subtotalLabel}>Subtotal</span>
                <span className={styles.subtotalValue}>{formatRupiah(selectedPlan.price)}</span>
              </div>
              {promoCut > 0 && (
                <div className={styles.totalRow}>
                  <span className={styles.discountLabel}>Promo {selectedPlan.promoPercent}%</span>
                  <span className={styles.discountValue}>− {formatRupiah(promoCut)}</span>
                </div>
              )}
              {coupon && (
                <div className={styles.totalRow}>
                  <span className={styles.discountLabel}>{promoCut > 0 ? `Kupon ${coupon.discount_percentage}%` : 'Diskon'}</span>
                  <span className={styles.discountValue}>
                    {discount > 0 ? `− ${formatRupiah(discount)}` : 'Rp0'}
                  </span>
                </div>
              )}
            </>
          )}
          <div className={`${styles.grandTotalRow} ${breakdown ? styles.grandTotalRowRuled : ''}`}>
            <span className={styles.grandTotalLabel}>Total pembayaran</span>
            <span className={styles.grandTotalValue}>{formatRupiah(finalAmount)}</span>
          </div>
          {finalAmount > 0 && (
            <p className={styles.uniqueCodeNote}>Tagihan ditambah kode unik beberapa ratus rupiah untuk verifikasi transfer.</p>
          )}
        </div>

        <div className={styles.summaryDivider} />

        {/* Trust lines (the 24-hour verification is stated only here) */}
        <ul className={styles.trustPoints}>
          <li className={styles.trustItem}>
            <Clock size={14} className={styles.trustIcon} />
            <span className={styles.trustText}>Pembayaran diverifikasi maksimal 24 jam</span>
          </li>
          <li className={styles.trustItem}>
            <Database size={14} className={styles.trustIcon} />
            <span className={styles.trustText}>Data travel terisolasi aman per akun</span>
          </li>
          <li className={styles.trustItem}>
            <Headset size={14} className={styles.trustIcon} />
            <span className={styles.trustText}>Didampingi tim KlikUmroh sampai aktif</span>
          </li>
        </ul>
      </div>

    </aside>
  );
};

// ─── Main CheckoutView Component ──────────────────────────────────────────

const toCheckoutPlans = (tiers: PlanTier[]): PricingPlan[] =>
  tiers.map((t) => ({
    id: t.id,
    name: t.name,
    period_months: t.periodMonths,
    price: t.price,
    monthly_equivalent: t.monthlyEquivalent,
    discount_label: t.discountLabel,
    discount_badge: t.discountBadge,
    popular: t.popular,
    promoPercent: t.promoPercent,
    promoPrice: t.promoPrice,
    promoEndsAt: t.promoEndsAt,
  }));

export const CheckoutView: React.FC<{ initialPlans?: PlanTier[] }> = ({ initialPlans = [] }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planIdParam = searchParams ? searchParams.get('plan_id') : null;

  // Checkout always shows the signup form, even with a session saved in this browser: a new travel
  // can sign up with another email. A successful signup replaces the saved session.
  useEffect(() => {
    try {
      localStorage.removeItem('ku_pending_signup'); // leftover from the old public payment flow
    } catch {}
  }, []);

  // Real plans rendered on the server; the browser only retries if the server could not reach the API.
  const [plans, setPlans] = useState<PricingPlan[]>(() => toCheckoutPlans(initialPlans));

  useEffect(() => {
    if (initialPlans.length > 0) return;
    fetch('/api/public/pricing-plans')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(toCheckoutPlans(toPlanTiers(data.plans)));
        }
      })
      .catch(() => {});
  }, [initialPlans]);

  const [activePlanId, setActivePlanId] = useState<number | null>(null);

  const selectedPlanId = useMemo(() => {
    if (activePlanId !== null && plans.some((p) => p.id === activePlanId)) {
      return activePlanId;
    }
    // Default: the 6-month plan (as in design), whatever its database ID is.
    const defaultId = (plans.find((p) => p.period_months === 6) ?? plans[0])?.id ?? 0;
    if (!planIdParam) return defaultId;
    const id = parseInt(planIdParam, 10);
    return isNaN(id) || !plans.some((p) => p.id === id) ? defaultId : id;
  }, [activePlanId, planIdParam, plans]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[1] ?? plans[0],
    [plans, selectedPlanId]
  );

  // The plan on screen right now: a coupon answer for another plan (the plan changed while the request was
  // in flight) is ignored, so a discount never sticks to a plan it was not validated for.
  const selectedPlanIdRef = useRef<number | undefined>(selectedPlan?.id);
  useEffect(() => {
    selectedPlanIdRef.current = selectedPlan?.id;
  }, [selectedPlan?.id]);

  const handlePlanChange = (plan: PricingPlan) => {
    // Set at once (not on the next render) so a coupon answer still in flight is recognised as stale.
    selectedPlanIdRef.current = plan.id;
    setActivePlanId(plan.id);
    setCoupon(null);
    setCouponCode('');
    setCouponError(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('plan_id', String(plan.id));
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Form State
  const [travelName, setTravelName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable' | 'unknown'>('idle');
  const [slugReason, setSlugReason] = useState('');
  const slugDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // The subdomain follows Nama Travel until the user types in the subdomain field (emptying it hands it back).
  const [slugEditedManually, setSlugEditedManually] = useState(false);

  const [adminName, setAdminName] = useState('');
  const [adminWhatsApp, setAdminWhatsApp] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const {
    settings: platformSettings,
    loaded: settingsLoaded,
    failed: settingsFailed,
    retry: retrySettings,
  } = usePlatformSettings();
  const legalReady = hasLegalDocuments(platformSettings);

  // Validation
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  // The one plan chooser: opened from the compact line (single column) or "Ubah Paket" (two columns).
  // CSS shows only the copy that belongs to the current layout, so there is one button and one list per viewport.
  const [planChooserOpen, setPlanChooserOpen] = useState(false);

  const liveErrors = useMemo(
    () =>
      validateForm(
        travelName,
        slug,
        adminName,
        adminWhatsApp,
        adminEmail,
        adminPassword
      ),
    [travelName, slug, adminName, adminWhatsApp, adminEmail, adminPassword]
  );

  // Only the newest slug check may set the status: an older check answering late must not show its
  // "sudah digunakan" / "tersedia" under the slug typed since.
  const slugCheckSeqRef = useRef(0);
  // name: the travel name, so a refusal can suggest a subdomain made from it instead of a fixed example.
  const checkSlugAvailability = useCallback(async (candidate: string, name: string) => {
    const seq = ++slugCheckSeqRef.current;
    if (!candidate || candidate.length < SLUG_MIN_LENGTH) {
      setSlugStatus('idle');
      return;
    }
    setSlugStatus('checking');
    setSlugReason('');
    try {
      const res = await fetch(
        `/api/public/check-slug?slug=${encodeURIComponent(candidate)}&name=${encodeURIComponent(name.trim())}`
      );
      // A 429 or gateway error may not be JSON; it is "could not check", never "already taken".
      const data = await res.json().catch(() => null);
      if (seq !== slugCheckSeqRef.current) return;
      const outcome = slugCheckOutcome(res.status, data);
      setSlugStatus(outcome.status);
      setSlugReason(outcome.reason);
    } catch {
      if (seq !== slugCheckSeqRef.current) return;
      setSlugStatus('idle');
    }
  }, [setSlugStatus, setSlugReason]);

  const handleSlugChange = (val: string) => {
    const cleaned = val
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
    setSlug(cleaned);
    setSlugEditedManually(cleaned !== '');

    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    slugCheckSeqRef.current++; // the slug changed: drop any check still in flight
    setSlugStatus('idle');
    if (cleaned.length >= SLUG_MIN_LENGTH) {
      slugDebounceRef.current = setTimeout(() => {
        checkSlugAvailability(cleaned, travelName);
      }, 500);
    } else {
      setSlugStatus('idle');
    }
  };

  const handleTravelNameChange = (val: string) => {
    setTravelName(val);
    // A refused subdomain typed by hand: check again so the suggested example follows the new name.
    if (slugEditedManually && slugStatus === 'unavailable' && slug.length >= SLUG_MIN_LENGTH) {
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
      slugDebounceRef.current = setTimeout(() => {
        checkSlugAvailability(slug, val);
      }, 600);
    }
    if (!slugEditedManually) {
      const autoSlug = slugifyTravelName(val);
      setSlug(autoSlug);
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
      slugCheckSeqRef.current++; // the slug changed: drop any check still in flight
      setSlugStatus('idle');
      if (autoSlug.length >= SLUG_MIN_LENGTH) {
        slugDebounceRef.current = setTimeout(() => {
          checkSlugAvailability(autoSlug, val);
        }, 600);
      } else {
        setSlugStatus('idle');
      }
    }
  };

  const handleWhatsAppChange = (val: string) => {
    const sanitized = val.replace(/[^0-9+\s-]/g, '');
    setAdminWhatsApp(sanitized);
  };

  const handleEmailChange = (val: string) => {
    const sanitized = val.replace(/\s/g, '');
    setAdminEmail(sanitized);
  };

  // Field errors appear after the user leaves a field they typed in, or after submit; never on first render,
  // while typing the first characters, or when an empty field is merely tapped and left.
  const handleBlur = (field: string, value: string) => {
    if (!value.trim()) return;
    setTouched((t) => ({ ...t, [field]: true }));
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    const requestedPlanId = selectedPlan.id;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/public/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          plan_id: requestedPlanId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (selectedPlanIdRef.current !== requestedPlanId) return;
      if (res.ok && data?.valid) {
        setCoupon({
          code: couponCode.trim().toUpperCase(),
          discount_percentage: data.discount_percentage,
          plan_id: data.plan_id,
          validatedForPlanId: requestedPlanId,
        });
        setCouponError(null);
      } else {
        setCoupon(null);
        // 429 gets the rate-limit text; otherwise the API's reason in `error` (e.g. "kode kupon tidak ditemukan").
        setCouponError(couponErrorMessage(res.status, data));
      }
    } catch {
      if (selectedPlanIdRef.current !== requestedPlanId) return;
      setCoupon(null);
      setCouponError('Gagal memvalidasi kupon. Coba lagi.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    // Consent is given by submitting (text under the button), so signup needs the published documents.
    if (!legalReady) return;

    setTouched({
      travel_name: true,
      slug: true,
      admin_name: true,
      admin_whatsapp: true,
      admin_email: true,
      admin_password: true,
    });

    const errs = validateForm(
      travelName,
      slug,
      adminName,
      adminWhatsApp,
      adminEmail,
      adminPassword
    );

    if (Object.keys(errs).length > 0) {
      if (errs.admin_whatsapp) {
        setSubmitError(errs.admin_whatsapp);
      } else if (errs.admin_email) {
        setSubmitError(errs.admin_email);
      } else if (errs.travel_name) {
        setSubmitError(errs.travel_name);
      } else if (errs.slug) {
        setSubmitError(errs.slug);
      } else if (errs.admin_name) {
        setSubmitError(errs.admin_name);
      } else if (errs.admin_password) {
        setSubmitError(errs.admin_password);
      } else {
        setSubmitError('Mohon lengkapi semua data formulir dengan benar.');
      }
      return;
    }

    if (slugStatus === 'unavailable') {
      setSubmitError('Subdomain sudah digunakan. Pilih subdomain lain.');
      return;
    }

    // A code typed but never applied would be dropped silently and the travel billed at full price.
    if (!coupon && couponCode.trim()) {
      setSubmitError(
        couponLoading
          ? 'Kupon sedang diperiksa. Tunggu sebentar lalu tekan lagi.'
          : 'Kode kupon belum dipakai. Tekan "Pakai" untuk memakainya, atau kosongkan kolom kupon.'
      );
      return;
    }
    // Never send a coupon checked for another plan (the backend would reject a plan-restricted one).
    if (coupon && coupon.validatedForPlanId !== selectedPlan.id) {
      setCoupon(null);
      setSubmitError('Kupon perlu diperiksa ulang untuk paket ini. Tekan "Pakai" sekali lagi.');
      return;
    }

    setSubmitting(true);
    // Set once the browser is navigating away after a successful signup: the button stays disabled.
    let leavingPage = false;

    // The plan list may be minutes old (server cache, or a tab left open while a promo started or ended):
    // check the current price first, so the travel never submits for a total that is no longer true.
    try {
      const fresh = await fetch('/api/public/pricing-plans', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
      if (fresh && Array.isArray(fresh.plans)) {
        const latest = toCheckoutPlans(toPlanTiers(fresh.plans));
        const now = latest.find((p) => p.id === selectedPlan.id);
        if (now && payablePrice(now) !== payablePrice(selectedPlan)) {
          setPlans(latest);
          setSubmitError(`Harga paket baru saja berubah menjadi ${formatRupiah(payablePrice(now))}. Periksa total pembayaran, lalu tekan lagi.`);
          setSubmitting(false);
          return;
        }
      }
    } catch {
      // Offline check failed: the server still bills the current price.
    }

    try {
      const cleanedWA = adminWhatsApp.trim().replace(/[\s\-()]/g, '');
      const payload = {
        plan_id: selectedPlan.id,
        travel_name: travelName.trim(),
        slug: slug.trim(),
        admin_name: adminName.trim(),
        admin_whatsapp: cleanedWA,
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
        coupon_code: coupon ? coupon.code : undefined,
        // Affiliator link code remembered by proxy.ts (cookie ku_aff); an affiliator coupon wins over it.
        affiliate_code: document.cookie.match(/(?:^|;\s*)ku_aff=([A-Za-z0-9]+)/)?.[1],
      };

      const res = await fetch('/api/public/tenant-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafe<{ payment_verification_id?: number; error?: string; message?: string }>(res);

      if (res.ok && data) {
        // Standard SaaS flow: sign the new account in and open its billing page in the dashboard.
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: payload.admin_email, password: adminPassword }),
        });
        const login = await loginRes.json().catch(() => null);
        if (!loginRes.ok || !login?.token) {
          // The account exists; let the travel sign in manually.
          leavingPage = true;
          router.push('/login');
          return;
        }
        storeDashboardSession(login);
        leavingPage = true;
        openDashboard(dashboardUrl(login, `/settings/subscription/payment/${data.payment_verification_id}`));
        return;
      } else {
        setSubmitError(
          apiErrorMessage(res.status, data, data?.message || 'Terjadi kesalahan saat memproses pendaftaran.')
        );
      }
    } catch {
      setSubmitError('Gagal terhubung ke server. Silakan periksa koneksi Anda.');
    } finally {
      if (!leavingPage) setSubmitting(false);
    }
  };

  // No plans could be loaded (API unreachable): never fall back to hardcoded prices.
  if (!selectedPlan) {
    return (
      <div className={styles.page}>
        <div className={styles.alertError} role="alert">
          <AlertCircle size={18} />
          <span>Daftar paket langganan sedang tidak dapat dimuat. Silakan muat ulang halaman beberapa saat lagi.</span>
        </div>
      </div>
    );
  }

  // Amount after the coupon, for the compact summary line (same rounding as the backend invoice).
  const compactTotal = discountedPrice(payablePrice(selectedPlan), coupon ? coupon.discount_percentage : 0).finalAmount;

  // ─── Main Checkout View ───
  return (
    <div className={`${styles.page} ${serif.variable}`}>
      {/* Checkout Navigation: same bar as the klikumroh.id landing header (brand, height, rule) */}
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.navBrand} aria-label="KlikUmroh">
            <KlikUmrohBrand />
          </Link>
          <div className={styles.navSecure}>
            <Lock size={14} className={styles.navSecureIcon} />
            <span className={styles.navSecureText}>Checkout aman</span>
          </div>
        </div>
      </header>

      {/* Checkout Main Content (gap: 56px, pad: 44px 120px 56px) */}
      <main className={styles.main}>
        <div className={styles.intro}>
            {/* Back to Pricing Link */}
            <Link href="/#harga" className={styles.backLink}>
              <ArrowLeft size={16} className={styles.backArrow} />
              <span className={styles.backText}>Kembali ke pilihan paket</span>
            </Link>

            {/* Checkout Heading */}
            <div className={styles.headingGroup}>
              <h1 className={styles.checkoutTitle}>Lengkapi data travel Anda</h1>
              <p className={styles.checkoutDesc}>
                Data ini digunakan untuk membuat akun dan alamat website travel Anda.
              </p>
            </div>

        </div>
        <div className={styles.mainInner}>
          {/* ── Left: Checkout Form Column (w: 700px, gap: 22px) ── */}
          <div className={styles.formColumn}>
            {/* Compact summary line (single-column layout only): the full summary follows the form. */}
            <div className={styles.compactSummary} data-testid="checkout-compact-summary">
              <div className={styles.compactSummaryRow}>
                <p className={styles.compactSummaryText}>
                  <span className={styles.compactSummaryPlan}>{selectedPlan.name}</span>
                  <span className={styles.compactSummaryAmount}>{formatRupiah(compactTotal)}</span>
                </p>
                {plans.length > 1 && (
                  <button
                    type="button"
                    id="compact-change-plan-btn"
                    className={styles.compactChangeBtn}
                    onClick={() => setPlanChooserOpen((open) => !open)}
                    aria-expanded={planChooserOpen}
                    aria-controls="compact-plan-options"
                  >
                    <span>Ubah</span>
                    <ChevronDown
                      size={14}
                      className={`${styles.changePlanChevron} ${planChooserOpen ? styles.changePlanChevronOpen : ''}`}
                    />
                  </button>
                )}
              </div>
              {planChooserOpen && plans.length > 1 && (
                <PlanChooser
                  id="compact-plan-options"
                  plans={plans}
                  selectedPlan={selectedPlan}
                  onPlanChange={handlePlanChange}
                  onClose={() => setPlanChooserOpen(false)}
                  disabled={couponLoading}
                />
              )}
            </div>

            {submitError && (
              <div className={styles.alertError} role="alert">
                <AlertCircle size={18} />
                <span>{submitError}</span>
              </div>
            )}

            {/* Travel Registration Form Card */}
            <div className={styles.formCard}>
              {/* Step indicator: this page is step 1 */}
              <ol className={styles.steps} aria-label="Langkah pendaftaran" data-testid="checkout-steps">
                {SIGNUP_STEPS.map((label, i) => (
                  <li
                    key={label}
                    className={`${styles.step} ${i === 0 ? styles.stepCurrent : ''}`}
                    aria-current={i === 0 ? 'step' : undefined}
                  >
                    <span className={styles.stepNumber}>{i + 1}</span>
                    <span className={styles.stepLabel}>{label}</span>
                  </li>
                ))}
              </ol>

              <h2 className={styles.formSectionHeading}>Informasi travel</h2>

              <form id="checkout-form" onSubmit={handleSubmit} noValidate>
                <div className={styles.formFields}>
                  {/* Nama Travel */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="travel-name">
                      Nama Travel
                    </label>
                    <input
                      id="travel-name"
                      name="travel_name"
                      type="text"
                      autoComplete="organization"
                      className={`${styles.fieldInput} ${
                        touched.travel_name && liveErrors.travel_name ? styles.fieldInputError : ''
                      }`}
                      placeholder="Contoh: Al-Barakah Tour & Travel"
                      value={travelName}
                      onChange={(e) => handleTravelNameChange(e.target.value)}
                      onBlur={() => handleBlur('travel_name', travelName)}
                    />
                    {touched.travel_name && liveErrors.travel_name && (
                      <span className={styles.errorText}>{liveErrors.travel_name}</span>
                    )}
                  </div>

                  {/* Subdomain */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="subdomain-input">
                      Subdomain
                    </label>
                    <div
                      className={`${styles.subdomainContainer} ${
                        touched.slug && liveErrors.slug ? styles.fieldInputError : ''
                      }`}
                    >
                      <input
                        id="subdomain-input"
                        name="slug"
                        type="text"
                        className={styles.subdomainInputField}
                        placeholder="nama-travel"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={slug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        onBlur={() => handleBlur('slug', slug)}
                        maxLength={SLUG_MAX_LENGTH}
                      />
                      <div className={styles.subdomainSuffixBox}>
                        <span className={styles.subdomainSuffixText}>.klikumroh.id</span>
                      </div>
                    </div>
                    {slugStatus === 'checking' && (
                      <span className={styles.statusChecking}>
                        <Loader2 size={12} className={styles.spinner} /> Memeriksa ketersediaan...
                      </span>
                    )}
                    {slugStatus === 'available' && (
                      <span className={styles.statusAvailable}>
                        <Check size={12} /> Subdomain tersedia
                      </span>
                    )}
                    {slugStatus === 'unavailable' && (
                      <span className={styles.statusUnavailable}>{slugReason}</span>
                    )}
                    {slugStatus === 'unknown' && (
                      <span className={styles.statusChecking}>{slugReason}</span>
                    )}
                    {touched.slug && liveErrors.slug && slugStatus !== 'unavailable' && (
                      <span className={styles.errorText}>{liveErrors.slug}</span>
                    )}
                  </div>

                  {/* PIC & WhatsApp Row */}
                  <div className={styles.twoColRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="admin-name">
                        Nama PIC
                      </label>
                      <input
                        id="admin-name"
                        name="admin_name"
                        type="text"
                        autoComplete="name"
                        className={`${styles.fieldInput} ${
                          touched.admin_name && liveErrors.admin_name ? styles.fieldInputError : ''
                        }`}
                        placeholder="Nama penanggung jawab"
                        value={adminName}
                        onChange={(e) => setAdminName(capitalizeName(e.target.value))}
                        autoCapitalize="words"
                        onBlur={() => handleBlur('admin_name', adminName)}
                      />
                      {touched.admin_name && liveErrors.admin_name && (
                        <span className={styles.errorText}>{liveErrors.admin_name}</span>
                      )}
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="admin-whatsapp">
                        No. WhatsApp
                      </label>
                      <input
                        id="admin-whatsapp"
                        name="admin_whatsapp"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        className={`${styles.fieldInput} ${
                          touched.admin_whatsapp && liveErrors.admin_whatsapp ? styles.fieldInputError : ''
                        }`}
                        placeholder="08xxxxxxxxxx"
                        value={adminWhatsApp}
                        onChange={(e) => handleWhatsAppChange(e.target.value)}
                        onBlur={() => handleBlur('admin_whatsapp', adminWhatsApp)}
                      />
                      {touched.admin_whatsapp && liveErrors.admin_whatsapp && (
                        <span className={styles.errorText}>{liveErrors.admin_whatsapp}</span>
                      )}
                    </div>
                  </div>

                  {/* Email & Password Row */}
                  <div className={styles.twoColRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="admin-email">
                        Email
                      </label>
                      <input
                        id="admin-email"
                        name="admin_email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        className={`${styles.fieldInput} ${
                          touched.admin_email && liveErrors.admin_email ? styles.fieldInputError : ''
                        }`}
                        placeholder="nama@travel.com"
                        value={adminEmail}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        onBlur={() => handleBlur('admin_email', adminEmail)}
                      />
                      {touched.admin_email && liveErrors.admin_email && (
                        <span className={styles.errorText}>{liveErrors.admin_email}</span>
                      )}
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="admin-password">
                        Password
                      </label>
                      <div
                        className={`${styles.passwordContainer} ${
                          touched.admin_password && liveErrors.admin_password ? styles.fieldInputError : ''
                        }`}
                      >
                        <input
                          id="admin-password"
                          name="admin_password"
                          type={showPassword ? 'text' : 'password'}
                          className={styles.passwordInputField}
                          placeholder="Minimal 8 karakter"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          onBlur={() => handleBlur('admin_password', adminPassword)}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          id="toggle-password-btn"
                          className={styles.passwordToggleBtn}
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        >
                          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                      {touched.admin_password && liveErrors.admin_password && (
                        <span className={styles.errorText}>{liveErrors.admin_password}</span>
                      )}
                    </div>
                  </div>

                  {/* Legal documents: signup stays closed until the owner publishes both (consent text sits under the button) */}
                  {legalReady ? null : settingsFailed ? (
                    // The settings request failed: never claim the documents are missing; offer a retry.
                    <div className={styles.alertError} role="alert">
                      <AlertCircle size={18} />
                      <span>Pengaturan belum bisa dimuat, coba lagi.</span>
                      <button type="button" className={styles.changePlanBtn} onClick={retrySettings}>
                        Coba lagi
                      </button>
                    </div>
                  ) : (
                    settingsLoaded && (
                      <div className={styles.alertError} role="alert">
                        <AlertCircle size={18} />
                        <span>
                          Pendaftaran belum dibuka karena Syarat & Ketentuan dan Kebijakan Privasi belum tersedia.
                          Silakan coba lagi nanti.
                        </span>
                      </div>
                    )
                  )}

                  <div className={styles.ctaGroup}>
                    {/* Continue to Payment Button */}
                    <button
                      id="checkout-submit-btn"
                      type="submit"
                      className={styles.submitBtn}
                      disabled={submitting || !legalReady}
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={17} className={styles.spinner} />
                          <span>Memproses...</span>
                        </>
                      ) : (
                        <>
                          <span>Lanjut ke pembayaran</span>
                          <ArrowRight size={17} />
                        </>
                      )}
                    </button>

                    {/* Money-back guarantee, one line directly under the CTA */}
                    <p className={styles.guarantee}>
                      <ShieldCheck size={16} className={styles.guaranteeIcon} aria-hidden="true" />
                      <span>Garansi 14 hari uang kembali 100%</span>
                    </p>

                    {/* Consent by submitting (the backend contract has no terms field) */}
                    {legalReady && (
                      <p className={styles.consentText}>
                        Dengan mendaftar, Anda menyetujui{' '}
                        <a href={platformSettings.terms_url} target="_blank" rel="noopener noreferrer">
                          S&K
                        </a>{' '}
                        dan{' '}
                        <a href={platformSettings.privacy_url} target="_blank" rel="noopener noreferrer">
                          Kebijakan Privasi
                        </a>
                        .
                      </p>
                    )}
                  </div>

                  {/* Existing Account Prompt */}
                  <div className={styles.existingAccountPrompt}>
                    <span className={styles.existingAccountText}>Sudah punya akun?</span>{' '}
                    <Link href="/login" className={styles.loginLink}>
                      Masuk
                    </Link>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* ── Right: Order Summary Column (fill_container) ── */}
          <OrderSummary
            selectedPlan={selectedPlan}
            plans={plans}
            onPlanChange={handlePlanChange}
            coupon={coupon}
            couponCode={couponCode}
            onCouponCodeChange={(val) => {
              setCouponCode(val);
              setCouponError(null);
              if (!val) setCoupon(null);
            }}
            onApplyCoupon={handleApplyCoupon}
            onRemoveCoupon={() => {
              setCoupon(null);
              setCouponCode('');
              setCouponError(null);
            }}
            couponLoading={couponLoading}
            couponError={couponError}
            planChooserOpen={planChooserOpen}
            onTogglePlanChooser={() => setPlanChooserOpen((open) => !open)}
            onClosePlanChooser={() => setPlanChooserOpen(false)}
          />
        </div>
      </main>
    </div>
  );
};
