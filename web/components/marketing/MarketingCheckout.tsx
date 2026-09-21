import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import styles from './MarketingCheckout.module.css';
import { PLANS, PlanTier } from './MarketingPricing';
import { KlikUmrohBrand } from './KlikUmrohBrand';

interface SignupResult {
  travel_name: string;
  final_amount: number;
  error?: string;
}

const CheckoutForm = () => {
  const searchParams = useSearchParams();

  // Derive initial plan from URL param without setState-in-effect
  const initialPlan = useMemo<PlanTier>(() => {
    const planIdParam = searchParams.get('plan_id');
    if (planIdParam) {
      const id = parseInt(planIdParam, 10);
      const plan = PLANS.find((p) => p.id === id);
      if (plan) return plan;
    }
    return PLANS[0];
  }, [searchParams]);

  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(initialPlan);
  const [selectedPlanId, setSelectedPlanId] = useState<number>(initialPlan.id);

  // Form state
  const [travelName, setTravelName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminWhatsApp, setAdminWhatsApp] = useState('');
  const [couponCode, setCouponCode] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<SignupResult | null>(null);

  // Handle plan change
  const handlePlanChange = (plan: PlanTier) => {
    setSelectedPlanId(plan.id);
    setSelectedPlan(plan);
  };

  const handleTravelNameChange = (val: string) => {
    setTravelName(val);
    if (!slug || slug === travelName.toLowerCase().replace(/[^a-z0-9]/g, '')) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  };

  const handleSubmitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const res = await fetch('/api/public/tenant-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          travel_name: travelName,
          slug: slug,
          admin_name: adminName,
          admin_email: adminEmail,
          admin_password: adminPassword,
          admin_whatsapp: adminWhatsApp,
          plan_id: selectedPlan.id,
          coupon_code: couponCode ? couponCode.trim() : undefined,
        }),
      });

      const text = await res.text();
      let data: SignupResult;
      try {
        data = JSON.parse(text) as SignupResult;
      } catch {
        throw new Error('Terjadi kesalahan server: Response bukan JSON yang valid');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal melakukan pendaftaran');
      }

      setSuccessResult(data);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Terjadi kesalahan sistem, silakan coba lagi');
    } finally {
      setSubmitting(false);
    }
  };

  if (successResult) {
    return (
      <div className={styles.successBox}>
        <CheckCircle2 size={64} className={styles.successIcon} />
        <h2 className={styles.successTitle}>Pendaftaran Berhasil!</h2>
        <p className={styles.successDesc}>
          Akun biro travel <strong>{successResult.travel_name}</strong> telah terdaftar.
          Selesaikan pembayaran untuk mengaktifkan sistem Anda.
        </p>
        
        <div className={styles.transferInfoCard}>
          <div className={styles.transferRow}>
            <span>Total Pembayaran:</span>
            <strong>Rp {Number(successResult.final_amount).toLocaleString('id-ID')}</strong>
          </div>
          <div className={styles.transferRow}>
            <span>Rekening Tujuan:</span>
            <strong>BCA 123-456-7890<br/>a.n PT Klik Umroh Digital</strong>
          </div>
        </div>
        
        <p className={styles.nextStepHint}>
          Silakan simpan bukti transfer Anda dan login ke dashboard admin untuk mengunggah bukti bayar.
        </p>
        
        <Link
          href="/login"
          className={styles.loginModalBtn}
        >
          Masuk ke Dashboard Admin
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.mainContent}>
      {/* LEFT COLUMN: PLAN OPTIONS & FORM */}
      <div className={styles.leftColumn}>
        <div className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.stepBadge}>1</span>
            Pilih Paket Berlangganan
          </h2>
          
          <div className={styles.planOptions}>
            {PLANS.map((plan) => (
              <div 
                key={plan.id}
                className={`${styles.planOption} ${selectedPlanId === plan.id ? styles.planOptionSelected : ''}`}
                onClick={() => handlePlanChange(plan)}
              >
                <div className={styles.planInfo}>
                  <div className={styles.radioCircle}>
                    <div className={styles.radioDot}></div>
                  </div>
                  <div>
                    <div className={styles.planName}>
                      {plan.name}
                      {plan.discountBadge && (
                        <span className={styles.discountBadge}>{plan.discountBadge}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={styles.planPrice}>
                  <div className={styles.priceAmount}>Rp {plan.price.toLocaleString('id-ID')}</div>
                  <div className={styles.pricePeriod}>
                    Rp {plan.monthlyEquivalent.toLocaleString('id-ID')}/bulan
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.stepBadge}>2</span>
            Data Biro Travel & Admin
          </h2>
          
          <form id="checkout-form" onSubmit={handleSubmitSignup}>
            {errorMsg && (
              <div className={styles.alertError}>
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="checkout-travel-name" className={styles.label}>Nama Biro Travel *</label>
                <input
                  id="checkout-travel-name"
                  type="text"
                  className={styles.input}
                  placeholder="Contoh: Al-Barakah Tour & Travel"
                  value={travelName}
                  onChange={(e) => handleTravelNameChange(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="checkout-slug" className={styles.label}>Subdomain Website *</label>
                <div className={styles.subdomainInputBox}>
                  <input
                    id="checkout-slug"
                    type="text"
                    className={styles.inputSubdomain}
                    placeholder="albarakah"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    required
                  />
                  <span className={styles.subdomainSuffix}>.klikumroh.id</span>
                </div>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="checkout-admin-name" className={styles.label}>Nama Penanggung Jawab *</label>
                <input
                  id="checkout-admin-name"
                  type="text"
                  className={styles.input}
                  placeholder="Contoh: H. Ahmad Subardjo"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="checkout-admin-whatsapp" className={styles.label}>Nomor WhatsApp Aktif *</label>
                <input
                  id="checkout-admin-whatsapp"
                  type="tel"
                  className={styles.input}
                  placeholder="Contoh: 081234567890"
                  value={adminWhatsApp}
                  onChange={(e) => setAdminWhatsApp(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="checkout-admin-email" className={styles.label}>Email Login Admin *</label>
                <input
                  id="checkout-admin-email"
                  type="email"
                  className={styles.input}
                  placeholder="admin@travelanda.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="checkout-admin-password" className={styles.label}>Kata Sandi (Min 8 Karakter) *</label>
                <input
                  id="checkout-admin-password"
                  type="password"
                  className={styles.input}
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="checkout-coupon-code" className={styles.label}>Kode Kupon / Promo (Opsional)</label>
              <input
                id="checkout-coupon-code"
                type="text"
                className={styles.input}
                placeholder="Masukkan kode voucher jika ada"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
            </div>
          </form>
        </div>
      </div>

      {/* RIGHT COLUMN: ORDER SUMMARY */}
      <div className={styles.rightColumn}>
        <div className={styles.summaryBox}>
          <div className={styles.summaryHeader}>
            <h3 className={styles.summaryTitle}>Ringkasan Pesanan</h3>
          </div>
          <div className={styles.summaryContent}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Paket</span>
              <span className={styles.summaryValue}>{selectedPlan.name}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Durasi</span>
              <span className={styles.summaryValue}>{selectedPlan.periodMonths} Bulan</span>
            </div>
            
            <div className={styles.divider}></div>
            
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Subtotal</span>
              <span className={styles.summaryValue}>Rp {selectedPlan.price.toLocaleString('id-ID')}</span>
            </div>
            
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Total Tagihan</span>
              <span className={styles.totalValue}>Rp {selectedPlan.price.toLocaleString('id-ID')}</span>
            </div>
            
            <button
              type="submit"
              form="checkout-form"
              className={styles.submitBtn}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className={styles.spinner} />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <span>Lanjutkan ke Pembayaran</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
            
            <p className={styles.guaranteeText}>
              <ShieldCheck size={16} />
              Transaksi aman & terenkripsi
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const MarketingCheckout: React.FC = () => {
  return (
    <div className={styles.pageContainer}>
      {/* SIMPLE HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContainer}>
          <a href="/marketing" className={styles.brand}>
            <KlikUmrohBrand theme="light" iconSize={28} />
          </a>
        </div>
      </header>

      {/* CHECKOUT CONTENT */}
      <Suspense fallback={<div style={{ textAlign: 'center', padding: '100px' }}><Loader2 size={32} className={styles.spinner} style={{margin: '0 auto', color: '#09090B'}}/></div>}>
        <CheckoutForm />
      </Suspense>
    </div>
  );
};
