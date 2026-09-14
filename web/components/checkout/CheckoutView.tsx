'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PaymentInstructionView } from './PaymentInstructionView';
import styles from './CheckoutView.module.css';

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
}

interface CouponResult {
  code: string;
  discount_percentage: number;
  plan_id?: number;
}

interface SignupResult {
  payment_verification_id: number;
  final_amount: number;
  unique_code?: number;
  tenant_id: number;
  travel_name: string;
  error?: string;
}

interface FormErrors {
  travel_name?: string;
  slug?: string;
  admin_name?: string;
  admin_whatsapp?: string;
  admin_email?: string;
  admin_password?: string;
  agree_terms?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const INCLUDED_FEATURES = [
  'Jumlah agen tanpa batas',
  'Website dengan brand travel',
  'Manajemen prospek dan komisi',
  'Tools marketing siap pakai',
];

// ─── Format Validations ───────────────────────────────────────────────────

export function validateWhatsApp(val: string): string | undefined {
  const trimmed = val.trim();
  if (!trimmed) {
    return 'Nomor WhatsApp wajib diisi';
  }

  // Bersihkan karakter pemisah umum
  const cleaned = trimmed.replace(/[\s\-()]/g, '');

  // Cek karakter angka dan leading +
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return 'Nomor WhatsApp hanya boleh berisi angka';
  }

  // Format Indonesia yang diawali 0: harus nomor seluler 08 (bukan telepon rumah 02x)
  if (cleaned.startsWith('0')) {
    if (!cleaned.startsWith('08')) {
      return 'Nomor WhatsApp harus nomor seluler (diawali 08)';
    }
    if (cleaned.length < 10 || cleaned.length > 14) {
      return 'Nomor WhatsApp harus 10–14 digit (contoh: 081234567890)';
    }
    return undefined;
  }

  // Format Indonesia yang diawali +62: harus +628
  if (cleaned.startsWith('+62')) {
    if (!cleaned.startsWith('+628')) {
      return 'Nomor WhatsApp Indonesia harus diawali +628';
    }
    if (cleaned.length < 12 || cleaned.length > 16) {
      return 'Nomor WhatsApp harus 11–15 digit (contoh: +6281234567890)';
    }
    return undefined;
  }

  // Format Indonesia yang diawali 62: harus 628
  if (cleaned.startsWith('62')) {
    if (!cleaned.startsWith('628')) {
      return 'Nomor WhatsApp Indonesia harus diawali 628';
    }
    if (cleaned.length < 11 || cleaned.length > 15) {
      return 'Nomor WhatsApp harus 11–15 digit (contoh: 6281234567890)';
    }
    return undefined;
  }

  // Format internasional diawali +
  if (cleaned.startsWith('+')) {
    if (cleaned.length < 10 || cleaned.length > 16) {
      return 'Format nomor internasional tidak valid (minimal 10 digit)';
    }
    return undefined;
  }

  return 'Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx';
}

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
  agreeTerms: boolean,
): FormErrors {
  const errs: FormErrors = {};

  if (!travelName.trim() || travelName.trim().length < 2)
    errs.travel_name = 'Nama travel minimal 2 karakter';

  if (!slug.trim() || slug.trim().length < 3)
    errs.slug = 'Subdomain minimal 3 karakter';
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.trim()))
    errs.slug = 'Hanya huruf kecil, angka, dan tanda hubung (-)';

  if (!adminName.trim() || adminName.trim().length < 2)
    errs.admin_name = 'Nama PIC minimal 2 karakter';

  const waErr = validateWhatsApp(adminWhatsApp);
  if (waErr) errs.admin_whatsapp = waErr;

  const emailErr = validateEmail(adminEmail);
  if (emailErr) errs.admin_email = emailErr;

  if (!adminPassword) errs.admin_password = 'Password wajib diisi';
  else if (adminPassword.length < 8)
    errs.admin_password = 'Password minimal 8 karakter';

  if (!agreeTerms)
    errs.agree_terms = 'Anda harus menyetujui Syarat & Ketentuan';

  return errs;
}

// ─── Order Summary subcomponent ────────────────────────────────────────────

interface OrderSummaryProps {
  selectedPlan: PricingPlan;
  coupon: CouponResult | null;
  couponCode: string;
  onCouponCodeChange: (val: string) => void;
  onApplyCoupon: () => void;
  couponLoading: boolean;
  couponError: string | null;
}

const OrderSummary: React.FC<OrderSummaryProps> = ({
  selectedPlan,
  coupon,
  couponCode,
  onCouponCodeChange,
  onApplyCoupon,
  couponLoading,
  couponError,
}) => {
  const discount = coupon
    ? Math.round((selectedPlan.price * coupon.discount_percentage) / 100)
    : 0;
  const finalAmount = Math.round(selectedPlan.price - discount);

  return (
    <aside className={styles.summaryColumn} aria-label="Ringkasan Pesanan">
      {/* Order Summary Card (Dark Forest Green) */}
      <div className={styles.summaryCard}>
        {/* Header */}
        <div className={styles.summaryHeader}>
          <div className={styles.summaryTitleGroup}>
            <span className={styles.summaryEyebrow}>RINGKASAN PESANAN</span>
            <h2 className={styles.selectedPlanTitle}>{selectedPlan.name}</h2>
          </div>
          {selectedPlan.popular && (
            <div className={styles.popularBadge}>
              <span className={styles.popularBadgeText}>PALING POPULER</span>
            </div>
          )}
        </div>

        {/* Selected Plan Price */}
        <div className={styles.priceBlock}>
          <div className={styles.priceRow}>
            <span className={styles.monthlyPrice}>
              Rp{selectedPlan.monthly_equivalent.toLocaleString('id-ID')}
            </span>
            <span className={styles.perMonth}>/bln</span>
          </div>
          <span className={styles.billingNote}>
            Dibayar satu kali untuk masa aktif {selectedPlan.period_months} bulan
          </span>
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

        {/* Coupon Section */}
        <div className={styles.couponSection}>
          <label htmlFor="coupon-input" className={styles.couponLabel}>
            Punya kupon?
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
                disabled={couponLoading || !!coupon}
                maxLength={20}
              />
            </div>
            <button
              type="button"
              id="apply-coupon-btn"
              className={styles.applyCouponBtn}
              onClick={onApplyCoupon}
              disabled={couponLoading || !couponCode.trim() || !!coupon}
            >
              {couponLoading ? (
                <Loader2 size={14} className={styles.spinner} />
              ) : coupon ? (
                'Dipakai'
              ) : (
                'Pakai'
              )}
            </button>
          </div>

          {coupon && (
            <span className={`${styles.couponStatusMessage} ${styles.couponSuccess}`}>
              Kupon {coupon.code} hemat {coupon.discount_percentage}%!
            </span>
          )}
          {couponError && (
            <span className={`${styles.couponStatusMessage} ${styles.couponError}`}>
              {couponError}
            </span>
          )}
        </div>

        <div className={styles.summaryDivider} />

        {/* Order Totals */}
        <div className={styles.orderTotals}>
          <div className={styles.totalRow}>
            <span className={styles.subtotalLabel}>Subtotal</span>
            <span className={styles.subtotalValue}>
              Rp{selectedPlan.price.toLocaleString('id-ID')}
            </span>
          </div>
          <div className={styles.totalRow}>
            <span className={styles.discountLabel}>Diskon</span>
            <span className={styles.discountValue}>
              {discount > 0 ? `− Rp${discount.toLocaleString('id-ID')}` : 'Rp0'}
            </span>
          </div>
          <div className={styles.grandTotalRow}>
            <span className={styles.grandTotalLabel}>Total pembayaran</span>
            <span className={styles.grandTotalValue}>
              Rp{finalAmount.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Security Note */}
      <div className={styles.securityNote}>
        <ShieldCheck size={18} className={styles.securityIcon} />
        <span className={styles.securityText}>
          Data akun dan transaksi Anda dilindungi.
        </span>
      </div>
    </aside>
  );
};

// ─── Main CheckoutView Component ──────────────────────────────────────────

export const CheckoutView: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planIdParam = searchParams ? searchParams.get('plan_id') : null;

  const [pendingSession, setPendingSession] = useState<any>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ku_pending_signup');
      if (stored) {
        setPendingSession(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const [plans, setPlans] = useState<PricingPlan[]>([
    {
      id: 1,
      name: 'Paket 3 Bulan',
      period_months: 3,
      price: 1500000,
      monthly_equivalent: 500000,
      discount_label: 'FLEKSIBEL',
    },
    {
      id: 2,
      name: 'Paket 6 Bulan',
      period_months: 6,
      price: 2700000,
      monthly_equivalent: 450000,
      discount_label: 'PALING POPULER',
      discount_badge: 'Hemat 10%',
      popular: true,
    },
    {
      id: 3,
      name: 'Paket 12 Bulan',
      period_months: 12,
      price: 4800000,
      monthly_equivalent: 400000,
      discount_label: 'PALING HEMAT',
      discount_badge: 'Hemat 20%',
    },
  ]);

  useEffect(() => {
    fetch('/api/public/pricing-plans')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch pricing plans');
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.plans) && data.plans.length > 0) {
          const mapped: PricingPlan[] = data.plans.map(
            (p: { id: number; name: string; period_months: number; price: number }) => {
              const months = p.period_months || 1;
              const monthlyEq = Math.round(p.price / months);
              let label = 'FLEKSIBEL';
              let badge: string | undefined;
              let popular = false;

              if (months === 6) {
                label = 'PALING POPULER';
                badge = 'Hemat 10%';
                popular = true;
              } else if (months >= 12) {
                label = 'PALING HEMAT';
                badge = 'Hemat 20%';
              }

              return {
                id: p.id,
                name: p.name.toLowerCase().startsWith('paket') ? p.name : `Paket ${p.name}`,
                period_months: months,
                price: p.price,
                monthly_equivalent: monthlyEq,
                discount_label: label,
                discount_badge: badge,
                popular,
              };
            }
          );
          setPlans(mapped);
        }
      })
      .catch(() => {});
  }, []);

  const selectedPlanId = useMemo(() => {
    if (!planIdParam) return 2; // default 6 Bulan as in design
    const id = parseInt(planIdParam, 10);
    return isNaN(id) || !plans.some((p) => p.id === id) ? 2 : id;
  }, [planIdParam, plans]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[1],
    [plans, selectedPlanId]
  );

  // Form State
  const [travelName, setTravelName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [slugReason, setSlugReason] = useState('');
  const slugDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const [adminName, setAdminName] = useState('');
  const [adminWhatsApp, setAdminWhatsApp] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Validation
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<SignupResult | null>(null);

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const liveErrors = useMemo(
    () =>
      validateForm(
        travelName,
        slug,
        adminName,
        adminWhatsApp,
        adminEmail,
        adminPassword,
        agreeTerms
      ),
    [travelName, slug, adminName, adminWhatsApp, adminEmail, adminPassword, agreeTerms]
  );

  const checkSlugAvailability = useCallback(async (candidate: string) => {
    if (!candidate || candidate.length < 3) {
      setSlugStatus('idle');
      return;
    }
    setSlugStatus('checking');
    setSlugReason('');
    try {
      const res = await fetch(
        `/api/public/check-slug?slug=${encodeURIComponent(candidate)}`
      );
      const data = await res.json();
      if (data.available) {
        setSlugStatus('available');
      } else {
        setSlugStatus('unavailable');
        setSlugReason(data.reason || 'Subdomain sudah digunakan');
      }
    } catch {
      setSlugStatus('idle');
    }
  }, []);

  const handleSlugChange = (val: string) => {
    const cleaned = val
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
    setSlug(cleaned);
    setTouched((t) => ({ ...t, slug: true }));

    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    if (cleaned.length >= 3) {
      slugDebounceRef.current = setTimeout(() => {
        checkSlugAvailability(cleaned);
      }, 500);
    } else {
      setSlugStatus('idle');
    }
  };

  const handleTravelNameChange = (val: string) => {
    setTravelName(val);
    if (!touched.slug) {
      const autoSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50);
      setSlug(autoSlug);
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
      if (autoSlug.length >= 3) {
        slugDebounceRef.current = setTimeout(() => {
          checkSlugAvailability(autoSlug);
        }, 600);
      } else {
        setSlugStatus('idle');
      }
    }
  };

  const handleWhatsAppChange = (val: string) => {
    const sanitized = val.replace(/[^0-9+\s-]/g, '');
    setAdminWhatsApp(sanitized);
    setTouched((t) => ({ ...t, admin_whatsapp: true }));
  };

  const handleEmailChange = (val: string) => {
    const sanitized = val.replace(/\s/g, '');
    setAdminEmail(sanitized);
    setTouched((t) => ({ ...t, admin_email: true }));
  };

  const handleBlur = (field: string) => {
    setTouched((t) => ({ ...t, [field]: true }));
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/public/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          plan_id: selectedPlan.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCoupon({
          code: couponCode.trim().toUpperCase(),
          discount_percentage: data.discount_percentage,
          plan_id: data.plan_id,
        });
        setCouponError(null);
      } else {
        setCoupon(null);
        setCouponError(data.message || 'Kupon tidak valid atau sudah kedaluwarsa');
      }
    } catch {
      setCoupon(null);
      setCouponError('Gagal memvalidasi kupon. Coba lagi.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    setTouched({
      travel_name: true,
      slug: true,
      admin_name: true,
      admin_whatsapp: true,
      admin_email: true,
      admin_password: true,
      agree_terms: true,
    });

    const errs = validateForm(
      travelName,
      slug,
      adminName,
      adminWhatsApp,
      adminEmail,
      adminPassword,
      agreeTerms
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
      } else if (errs.agree_terms) {
        setSubmitError(errs.agree_terms);
      } else {
        setSubmitError('Mohon lengkapi semua data formulir dengan benar.');
      }
      return;
    }

    if (slugStatus === 'unavailable') {
      setSubmitError('Subdomain sudah digunakan. Pilih subdomain lain.');
      return;
    }

    setSubmitting(true);

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
      };

      const res = await fetch('/api/public/tenant-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && (data.success || data.payment_verification_id)) {
        const discountVal = coupon
          ? Math.round((selectedPlan.price * coupon.discount_percentage) / 100)
          : 0;
        const orderNum = `KU-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(
          data.payment_verification_id || 1
        ).padStart(4, '0')}`;

        const sessionData = {
          orderNumber: orderNum,
          travelName: travelName.trim(),
          slug: slug.trim(),
          planName: selectedPlan.name,
          baseAmount: selectedPlan.price,
          discountAmount: discountVal,
          uniqueCode: data.unique_code || 0,
          finalAmount: data.final_amount,
          verificationId: data.payment_verification_id,
          adminEmail: adminEmail.trim().toLowerCase(),
          adminWhatsApp: cleanedWA,
        };

        try {
          localStorage.setItem('ku_pending_signup', JSON.stringify(sessionData));
        } catch {}

        const query = new URLSearchParams({
          order: orderNum,
          travel_name: travelName.trim(),
          slug: slug.trim(),
          plan: selectedPlan.name,
          base_amount: String(selectedPlan.price),
          discount_amount: String(discountVal),
          unique_code: String(data.unique_code || 0),
          final_amount: String(data.final_amount),
          verification_id: String(data.payment_verification_id),
          email: adminEmail.trim().toLowerCase(),
          whatsapp: cleanedWA,
        });

        router.push(`/checkout/payment?${query.toString()}`);
        return;
      } else {
        setSubmitError(
          data.error || data.message || 'Terjadi kesalahan saat memproses pendaftaran.'
        );
      }
    } catch {
      setSubmitError('Gagal terhubung ke server. Silakan periksa koneksi Anda.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success Screen (Payment Instruction Fallback) ───
  if (successResult) {
    const orderNum = `KU-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(
      successResult.payment_verification_id || 1
    ).padStart(4, '0')}`;

    return (
      <PaymentInstructionView
        orderNumber={orderNum}
        travelName={successResult.travel_name || travelName}
        slug={slug}
        planName={selectedPlan.name}
        baseAmount={selectedPlan.price}
        discountAmount={coupon ? Math.round((selectedPlan.price * coupon.discount_percentage) / 100) : 0}
        uniqueCode={successResult.unique_code}
        finalAmount={Math.round(Number(successResult.final_amount ?? selectedPlan.price))}
        verificationId={successResult.payment_verification_id}
        adminEmail={adminEmail}
        adminWhatsApp={adminWhatsApp}
      />
    );
  }

  // ─── Main Checkout View ───
  return (
    <div className={styles.page}>
      {/* Checkout Navigation (Height: 84px) */}
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          <Link href="/marketing" className={styles.navBrand}>
            <Image
              src="/klikumroh-logo.png"
              alt="KlikUmroh.id"
              width={190}
              height={55}
              className={styles.logoImage}
              priority
            />
          </Link>
          <div className={styles.navSecure}>
            <Lock size={16} className={styles.navSecureIcon} />
            <span className={styles.navSecureText}>Checkout aman</span>
          </div>
        </div>
      </header>

      {/* Checkout Main Content (gap: 56px, pad: 44px 120px 56px) */}
      <main className={styles.main}>
        <div className={styles.mainInner}>
          {/* ── Left: Checkout Form Column (w: 700px, gap: 22px) ── */}
          <div className={styles.formColumn}>
            {/* Back to Pricing Link */}
            <Link href="/marketing#harga" className={styles.backLink}>
              <ArrowLeft size={16} className={styles.backArrow} />
              <span className={styles.backText}>Kembali ke pilihan paket</span>
            </Link>

            {/* Pending Session Banner */}
            {pendingSession && (
              <div
                style={{
                  backgroundColor: 'var(--km-mint)',
                  border: '1px solid var(--km-line)',
                  borderRadius: '8px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '13px',
                  color: 'var(--km-ink)',
                }}
              >
                <div>
                  <strong>Pemberitahuan:</strong> Anda memiliki pendaftaran untuk <em>{pendingSession.travelName}</em> yang menunggu pembayaran.
                </div>
                <Link
                  href={`/checkout/payment?order=${pendingSession.orderNumber}&travel_name=${encodeURIComponent(pendingSession.travelName || '')}&slug=${encodeURIComponent(pendingSession.slug || '')}&plan=${encodeURIComponent(pendingSession.planName || '')}&base_amount=${pendingSession.baseAmount || ''}&discount_amount=${pendingSession.discountAmount || ''}&unique_code=${pendingSession.uniqueCode || ''}&final_amount=${pendingSession.finalAmount || ''}&verification_id=${pendingSession.verificationId || ''}&email=${encodeURIComponent(pendingSession.adminEmail || '')}&whatsapp=${encodeURIComponent(pendingSession.adminWhatsApp || '')}`}
                  style={{
                    fontWeight: 700,
                    color: 'var(--km-green)',
                    textDecoration: 'underline',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  Lihat Instruksi Pembayaran
                  <ArrowRight size={14} />
                </Link>
              </div>
            )}

            {/* Checkout Heading */}
            <div className={styles.headingGroup}>
              <h1 className={styles.checkoutTitle}>Lengkapi data travel Anda</h1>
              <p className={styles.checkoutDesc}>
                Data ini digunakan untuk membuat akun dan alamat website travel Anda.
              </p>
            </div>

            {submitError && (
              <div className={styles.alertError} role="alert">
                <AlertCircle size={18} />
                <span>{submitError}</span>
              </div>
            )}

            {/* Travel Registration Form Card */}
            <div className={styles.formCard}>
              <h2 className={styles.formSectionHeading}>Informasi travel</h2>

              <form id="checkout-form" onSubmit={handleSubmit} noValidate>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Nama Travel */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="travel-name">
                      Nama Travel
                    </label>
                    <input
                      id="travel-name"
                      name="travel_name"
                      type="text"
                      className={`${styles.fieldInput} ${
                        touched.travel_name && liveErrors.travel_name ? styles.fieldInputError : ''
                      }`}
                      placeholder="Contoh: Al-Barakah Tour & Travel"
                      value={travelName}
                      onChange={(e) => handleTravelNameChange(e.target.value)}
                      onBlur={() => handleBlur('travel_name')}
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
                        value={slug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        onBlur={() => handleBlur('slug')}
                        maxLength={50}
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
                        className={`${styles.fieldInput} ${
                          touched.admin_name && liveErrors.admin_name ? styles.fieldInputError : ''
                        }`}
                        placeholder="Nama penanggung jawab"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        onBlur={() => handleBlur('admin_name')}
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
                        className={`${styles.fieldInput} ${
                          touched.admin_whatsapp && liveErrors.admin_whatsapp ? styles.fieldInputError : ''
                        }`}
                        placeholder="08xxxxxxxxxx"
                        value={adminWhatsApp}
                        onChange={(e) => handleWhatsAppChange(e.target.value)}
                        onBlur={() => handleBlur('admin_whatsapp')}
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
                        className={`${styles.fieldInput} ${
                          touched.admin_email && liveErrors.admin_email ? styles.fieldInputError : ''
                        }`}
                        placeholder="nama@travel.com"
                        value={adminEmail}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        onBlur={() => handleBlur('admin_email')}
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
                          onBlur={() => handleBlur('admin_password')}
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

                  {/* Terms Agreement */}
                  <label className={styles.termsAgreement} htmlFor="agree-terms">
                    <input
                      id="agree-terms"
                      type="checkbox"
                      className={styles.termsCheckbox}
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                    />
                    <span className={styles.termsText}>
                      Saya menyetujui Syarat & Ketentuan dan Kebijakan Privasi KlikUmroh.
                    </span>
                  </label>

                  {/* Continue to Payment Button */}
                  <button
                    id="checkout-submit-btn"
                    type="submit"
                    className={styles.submitBtn}
                    disabled={submitting}
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
            coupon={coupon}
            couponCode={couponCode}
            onCouponCodeChange={(val) => {
              setCouponCode(val);
              setCouponError(null);
              if (!val) setCoupon(null);
            }}
            onApplyCoupon={handleApplyCoupon}
            couponLoading={couponLoading}
            couponError={couponError}
          />
        </div>
      </main>
    </div>
  );
};
