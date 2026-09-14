'use client';

import React, { useState, useEffect, useId } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Tag, Eye, EyeOff } from 'lucide-react';
import {
  PricingPlan,
  fetchPricingPlans,
  checkSlugAvailability,
  validateCoupon,
  submitTenantSignup,
  formatRupiah,
} from '../../lib/api';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import './daftar.css';

export const DaftarForm: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number>(1);
  const [travelName, setTravelName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [slugMessage, setSlugMessage] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminWhatsApp, setAdminWhatsApp] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPercentage: number;
    planId?: number | null;
    planName?: string | null;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string>('');

  // Form submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  const travelNameId = useId();
  const slugId = useId();
  const adminNameId = useId();
  const adminEmailId = useId();
  const adminWhatsAppId = useId();
  const adminPasswordId = useId();
  const couponId = useId();

  // Load plans & initial selected plan
  useEffect(() => {
    fetchPricingPlans().then((data) => {
      setPlans(data);
      const planParam = searchParams.get('plan');
      if (planParam) {
        const parsed = parseInt(planParam, 10);
        if (data.some((p) => p.id === parsed)) {
          setSelectedPlanId(parsed);
        }
      } else if (data.length > 0) {
        setSelectedPlanId(data[0].id);
      }
    });
  }, [searchParams]);

  // Debounced slug check
  useEffect(() => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setSlugStatus('idle');
      setSlugMessage('');
      return;
    }

    if (trimmed.length < 3) {
      setSlugStatus('unavailable');
      setSlugMessage('Minimal 3 karakter');
      return;
    }

    setSlugStatus('checking');
    setSlugMessage('Memeriksa ketersediaan...');

    const timer = setTimeout(async () => {
      try {
        const res = await checkSlugAvailability(trimmed);
        if (res.available) {
          setSlugStatus('available');
          setSlugMessage('Subdomain tersedia!');
        } else {
          setSlugStatus('unavailable');
          setSlugMessage(res.reason || 'Subdomain sudah terpakai');
        }
      } catch {
        setSlugStatus('unavailable');
        setSlugMessage('Gagal memeriksa slug');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [slug]);

  // Revalidate applied coupon if user switches plan
  useEffect(() => {
    if (appliedCoupon && couponCode.trim()) {
      validateCoupon(couponCode.trim().toUpperCase(), selectedPlanId)
        .then((res) => {
          setAppliedCoupon({
            code: res.code,
            discountPercentage: res.discount_percentage,
            planId: res.plan_id,
            planName: res.plan_name,
          });
          setCouponError('');
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Kupon tidak berlaku untuk paket ini';
          setCouponError(msg);
          setAppliedCoupon(null);
        });
    }
  }, [selectedPlanId]);

  const handleApplyCoupon = async () => {
    const trimmed = couponCode.trim().toUpperCase();
    if (!trimmed) {
      setCouponError('Masukkan kode kupon terlebih dahulu');
      return;
    }

    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await validateCoupon(trimmed, selectedPlanId);
      setAppliedCoupon({
        code: res.code,
        discountPercentage: res.discount_percentage,
        planId: res.plan_id,
        planName: res.plan_name,
      });
      setCouponError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kupon tidak valid';
      setCouponError(msg);
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const originalPrice = selectedPlan ? selectedPlan.price : 0;
  const discountAmount = appliedCoupon ? (originalPrice * appliedCoupon.discountPercentage) / 100 : 0;
  const finalPrice = Math.max(0, originalPrice - discountAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!travelName.trim()) {
      setFormError('Nama travel wajib diisi');
      return;
    }
    if (slugStatus !== 'available') {
      setFormError('Pastikan slug subdomain valid dan tersedia');
      return;
    }
    if (!adminName.trim()) {
      setFormError('Nama penanggung jawab admin wajib diisi');
      return;
    }
    if (!adminEmail.trim()) {
      setFormError('Email admin wajib diisi');
      return;
    }
    if (!adminWhatsApp.trim()) {
      setFormError('Nomor WhatsApp admin wajib diisi');
      return;
    }
    if (adminPassword.length < 8) {
      setFormError('Password minimal 8 karakter');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitTenantSignup({
        travel_name: travelName.trim(),
        slug: slug.trim().toLowerCase(),
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
        admin_whatsapp: adminWhatsApp.trim(),
        plan_id: selectedPlanId,
        coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
      });

      router.push(`/daftar/pembayaran?id=${res.payment_verification_id}&amount=${res.final_amount}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pendaftaran gagal';
      setFormError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="mkt-container mkt-daftar-container">
      <div className="mkt-daftar-header">
        <h1 className="mkt-headline">Pendaftaran Akun Travel</h1>
        <p className="mkt-subheadline">
          Lengkapi data travel Anda untuk mulai menggunakan sistem agen dan website whitelabel KlikUmroh.
        </p>
      </div>

      <div className="mkt-daftar-grid">
        {/* Left column: Form */}
        <div className="mkt-daftar-form-col">
          <Card className="mkt-daftar-card">
            <form onSubmit={handleSubmit}>
              {formError && (
                <div className="mkt-form-alert mkt-form-alert--error">
                  <XCircle className="mkt-form-alert__icon" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="mkt-form-section">
                <h3 className="mkt-form-section__title">1. Informasi Travel</h3>

                <div className="mkt-form-group">
                  <label htmlFor={travelNameId} className="mkt-form-label">
                    Nama Travel Umroh <span className="mkt-required">*</span>
                  </label>
                  <input
                    id={travelNameId}
                    type="text"
                    className="mkt-form-input"
                    placeholder="Contoh: Al-Barakah Tour & Travel"
                    value={travelName}
                    onChange={(e) => setTravelName(e.target.value)}
                    required
                  />
                </div>

                <div className="mkt-form-group">
                  <label htmlFor={slugId} className="mkt-form-label">
                    Subdomain Web Travel <span className="mkt-required">*</span>
                  </label>
                  <div className="mkt-slug-input-wrapper">
                    <input
                      id={slugId}
                      type="text"
                      className={`mkt-form-input ${
                        slugStatus === 'available'
                          ? 'mkt-form-input--success'
                          : slugStatus === 'unavailable'
                          ? 'mkt-form-input--error'
                          : ''
                      }`}
                      placeholder="albarakah"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      required
                    />
                    <span className="mkt-slug-suffix">.klikumroh.id</span>
                  </div>
                  {slugMessage && (
                    <div className={`mkt-slug-status mkt-slug-status--${slugStatus}`}>
                      {slugStatus === 'checking' && <Loader2 className="mkt-spin mkt-slug-status__icon" />}
                      {slugStatus === 'available' && <CheckCircle2 className="mkt-slug-status__icon" />}
                      {slugStatus === 'unavailable' && <XCircle className="mkt-slug-status__icon" />}
                      <span>{slugMessage}</span>
                    </div>
                  )}
                  <p className="mkt-form-hint">
                    Gunakan nama unik travel tanpa spasi. Anda juga dapat menghubungkan domain sendiri nanti.
                  </p>
                </div>
              </div>

              <div className="mkt-form-section">
                <h3 className="mkt-form-section__title">2. Akun Penanggung Jawab (Admin)</h3>

                <div className="mkt-form-group">
                  <label htmlFor={adminNameId} className="mkt-form-label">
                    Nama Lengkap Admin <span className="mkt-required">*</span>
                  </label>
                  <input
                    id={adminNameId}
                    type="text"
                    className="mkt-form-input"
                    placeholder="Contoh: Ustadz Ahmad Fauzi"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                  />
                </div>

                <div className="mkt-form-group">
                  <label htmlFor={adminEmailId} className="mkt-form-label">
                    Email Login <span className="mkt-required">*</span>
                  </label>
                  <input
                    id={adminEmailId}
                    type="email"
                    className="mkt-form-input"
                    placeholder="admin@albarakah.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                  />
                  <p className="mkt-form-hint">
                    Email ini digunakan untuk login ke Dashboard Admin KlikUmroh.
                  </p>
                </div>

                <div className="mkt-form-group">
                  <label htmlFor={adminWhatsAppId} className="mkt-form-label">
                    Nomor WhatsApp Admin <span className="mkt-required">*</span>
                  </label>
                  <input
                    id={adminWhatsAppId}
                    type="tel"
                    className="mkt-form-input"
                    placeholder="Contoh: 08123456789 atau 628123456789"
                    value={adminWhatsApp}
                    onChange={(e) => setAdminWhatsApp(e.target.value)}
                    required
                  />
                  <p className="mkt-form-hint">
                    Nomor WhatsApp aktif untuk konfirmasi pendaftaran dan notifikasi akun.
                  </p>
                </div>

                <div className="mkt-form-group">
                  <label htmlFor={adminPasswordId} className="mkt-form-label">
                    Kata Sandi <span className="mkt-required">*</span>
                  </label>
                  <div className="mkt-password-wrapper">
                    <input
                      id={adminPasswordId}
                      type={showPassword ? 'text' : 'password'}
                      className="mkt-form-input mkt-form-input--password"
                      placeholder="Minimal 8 karakter"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="mkt-password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mkt-form-section">
                <h3 className="mkt-form-section__title">3. Pilihan Paket Berlangganan</h3>

                <div className="mkt-plan-selector">
                  {plans.map((p) => {
                    const isSelected = p.id === selectedPlanId;
                    return (
                      <label
                        key={p.id}
                        className={`mkt-plan-option ${isSelected ? 'mkt-plan-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="plan_id"
                          value={p.id}
                          checked={isSelected}
                          onChange={() => setSelectedPlanId(p.id)}
                          className="mkt-plan-radio"
                        />
                        <div className="mkt-plan-option__content">
                          <div className="mkt-plan-option__title">Paket {p.name}</div>
                          <div className="mkt-plan-option__desc">{p.period_months} Bulan Akses</div>
                        </div>
                        <div className="mkt-plan-option__price">{formatRupiah(p.price)}</div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mkt-form-section">
                <h3 className="mkt-form-section__title">4. Kode Kupon Promo (Opsional)</h3>
                <div className="mkt-coupon-input-group">
                  <input
                    id={couponId}
                    type="text"
                    className="mkt-form-input"
                    placeholder="Contoh: DISKON100"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                  >
                    {couponLoading ? 'Memeriksa...' : 'Terapkan'}
                  </Button>
                </div>

                {couponError && (
                  <div className="mkt-form-alert mkt-form-alert--error" style={{ marginTop: '12px' }}>
                    <XCircle className="mkt-form-alert__icon" />
                    <span>{couponError}</span>
                  </div>
                )}

                {appliedCoupon && (
                  <div className="mkt-form-alert mkt-form-alert--success" style={{ marginTop: '12px' }}>
                    <Tag className="mkt-form-alert__icon" />
                    <span>
                      Kupon <strong>{appliedCoupon.code}</strong> berhasil digunakan: Diskon {appliedCoupon.discountPercentage}%
                      {appliedCoupon.planName ? ` (Khusus paket ${appliedCoupon.planName})` : ''}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '32px' }}>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={submitting || slugStatus === 'checking'}
                >
                  {submitting ? 'Memproses Pendaftaran...' : 'Lanjutkan ke Pembayaran'}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right column: Order Summary & Trust */}
        <div className="mkt-daftar-sidebar-col">
          <Card className="mkt-summary-card">
            <h3 className="mkt-summary-card__title">Ringkasan Pesanan</h3>

            <div className="mkt-summary-row">
              <span className="mkt-summary-label">Paket Dipilih</span>
              <span className="mkt-summary-value">{selectedPlan ? `Paket ${selectedPlan.name}` : '-'}</span>
            </div>

            <div className="mkt-summary-row">
              <span className="mkt-summary-label">Durasi Langganan</span>
              <span className="mkt-summary-value">{selectedPlan ? `${selectedPlan.period_months} Bulan` : '-'}</span>
            </div>

            <div className="mkt-summary-row">
              <span className="mkt-summary-label">Harga Normal</span>
              <span className="mkt-summary-value">{formatRupiah(originalPrice)}</span>
            </div>

            {appliedCoupon && (
              <div className="mkt-summary-row mkt-summary-row--discount">
                <span className="mkt-summary-label">Diskon ({appliedCoupon.discountPercentage}%)</span>
                <span className="mkt-summary-value">- {formatRupiah(discountAmount)}</span>
              </div>
            )}

            <div className="mkt-summary-divider" />

            <div className="mkt-summary-total">
              <span className="mkt-summary-total__label">Total Pembayaran</span>
              <span className="mkt-summary-total__value">{formatRupiah(finalPrice)}</span>
            </div>

            <div className="mkt-summary-trust">
              <ShieldCheck className="mkt-summary-trust__icon" />
              <div className="mkt-summary-trust__text">
                <strong>Data Travel Anda Terisolasi Penuh</strong>
                <p>Setiap travel berjalan sebagai tenant mandiri dengan audit access log lengkap.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
