import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Check,
  RefreshCw,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Card,
  FormInput,
  Button,
  Badge,
  getStandardMenuItems,
} from '../components';
import {
  fetchTenantSubscription,
  fetchPricingPlansForRenewal,
  validateCoupon,
  createRenewalInvoice,
  getStoredUser,
  getStoredTravelName,
  type TenantSubscriptionInfo,
  type SubscriptionPricingPlan,
} from '../services/api';

export const SubscriptionCheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPlanIdParam = searchParams.get('plan_id');

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [subInfo, setSubInfo] = useState<TenantSubscriptionInfo | null>(null);
  const [pricingPlans, setPricingPlans] = useState<SubscriptionPricingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const [couponCodeInput, setCouponCodeInput] = useState<string>('');
  const [validatedCoupon, setValidatedCoupon] = useState<{
    valid: boolean;
    code: string;
    discount_percentage: number;
  } | null>(null);
  const [couponValidating, setCouponValidating] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const currentUser = getStoredUser();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [info, plans] = await Promise.all([
          fetchTenantSubscription(),
          fetchPricingPlansForRenewal(),
        ]);
        setSubInfo(info);
        setPricingPlans(plans);

        if (plans.length > 0) {
          const parsedId = initialPlanIdParam ? parseInt(initialPlanIdParam, 10) : null;
          if (parsedId && plans.some((p) => p.id === parsedId)) {
            setSelectedPlanId(parsedId);
          } else if (info.current_plan_id && plans.some((p) => p.id === info.current_plan_id)) {
            setSelectedPlanId(info.current_plan_id);
          } else {
            setSelectedPlanId(plans[0].id);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Gagal memuat paket langganan');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [initialPlanIdParam]);

  const selectedPlan = pricingPlans.find((p) => p.id === selectedPlanId) || pricingPlans[0];
  const basePrice = selectedPlan ? selectedPlan.price : 0;
  const discountPct = validatedCoupon ? validatedCoupon.discount_percentage : 0;
  const discountAmount = (discountPct / 100) * basePrice;
  const finalAmount = Math.max(0, basePrice - discountAmount);

  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim() || !selectedPlan) return;
    try {
      setCouponValidating(true);
      setCouponError(null);
      const res = await validateCoupon(couponCodeInput.trim(), selectedPlan.id);
      setValidatedCoupon(res);
    } catch (err: any) {
      setValidatedCoupon(null);
      setCouponError(err.message || 'Kupon tidak valid');
    } finally {
      setCouponValidating(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!selectedPlan) {
      setError('Silakan pilih salah satu paket durasi perpanjangan');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await createRenewalInvoice(selectedPlan.id, validatedCoupon?.code);
      if (res.payment_verification && res.payment_verification.id) {
        navigate(`/settings/subscription/payment/${res.payment_verification.id}`);
      } else {
        navigate('/settings/subscription');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal membuat tagihan perpanjangan');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="db-main-layout">
        <Sidebar
          brandName="KlikUmroh.id"
          menuItems={getStandardMenuItems('settings-subscription')}
          footerContent="KlikUmroh.id 1.0"
        />
        <div className="db-content-area">
          <Topbar
            travelName={getStoredTravelName()}
            userName={currentUser?.name || 'Administrator'}
            userRole="Administrator"
            userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
          />
          <main className="db-page-container" style={{ maxWidth: '1140px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '40px 0', color: 'var(--db-text-muted)' }}>
              <RefreshCw size={20} className="db-spin" />
              <span>Memuat data perpanjangan paket...</span>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={getStandardMenuItems('settings-subscription')}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          travelName={subInfo?.tenant_name || getStoredTravelName()}
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: '1140px' }}>
          <div style={{ marginBottom: '16px' }}>
            <Link
              to="/settings/subscription"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: 'var(--db-text-muted)',
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={15} />
              <span>Kembali ke Pengaturan Langganan</span>
            </Link>
          </div>

          <PageHeader
            title="Perpanjang Lisensi Platform"
            subtitle="Pilih durasi paket perpanjangan dan lanjutkan untuk mendapatkan rincian tagihan transfer resmi."
          />

          {error && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '20px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="db-grid-sidebar-right">
            {/* KOLOM KIRI: PILIHAN PAKET & KONFIRMASI DATA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 1. Pilih Durasi Paket */}
              <Card
                title="1. Pilih Durasi Paket"
                subtitle="Semua paket memiliki akses fitur lengkap. Pilih durasi sesuai kebutuhan travel Anda."
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '14px',
                  }}
                >
                  {pricingPlans.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    const isCurrent = plan.id === subInfo?.current_plan_id;
                    const isBestValue = plan.period_months >= 12;

                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        style={{
                          border: isSelected
                            ? '2px solid var(--db-sidebar-active-highlight)'
                            : '1px solid var(--db-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '16px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--db-surface)' : 'var(--db-card-bg)',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '8px',
                            }}
                          >
                            <strong
                              style={{
                                fontFamily: 'var(--db-font-heading)',
                                fontSize: '15px',
                                fontWeight: 700,
                                color: 'var(--db-text-primary)',
                              }}
                            >
                              {plan.name || `${plan.period_months} Bulan`}
                            </strong>
                            {isCurrent ? (
                              <Badge variant="neutral">Paket saat ini</Badge>
                            ) : isBestValue ? (
                              <Badge variant="positive">Paling hemat</Badge>
                            ) : null}
                          </div>

                          <div style={{ marginTop: '6px', marginBottom: '2px' }}>
                            <span
                              style={{
                                fontFamily: 'var(--db-font-heading)',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'var(--db-text-primary)',
                              }}
                            >
                              {new Intl.NumberFormat('id-ID', {
                                style: 'currency',
                                currency: 'IDR',
                                minimumFractionDigits: 0,
                              }).format(Math.round(plan.price / plan.period_months))}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}> / bulan</span>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                            Total {new Intl.NumberFormat('id-ID', {
                              style: 'currency',
                              currency: 'IDR',
                              minimumFractionDigits: 0,
                            }).format(plan.price)}
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: '14px',
                            paddingTop: '10px',
                            borderTop: '1px solid var(--db-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: isSelected ? 'var(--db-sidebar-active-highlight)' : 'var(--db-text-muted)',
                          }}
                        >
                          {isSelected ? (
                            <>
                              <Check size={14} />
                              <span>Paket Dipilih</span>
                            </>
                          ) : (
                            <span>Pilih Paket</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* 2. Konfirmasi Data Travel */}
              <Card
                title="2. Konfirmasi Akun Travel"
                subtitle="Data travel yang terdaftar pada sistem KlikUmroh"
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                      Nama Biro Travel
                    </label>
                    <strong style={{ fontSize: '14px', color: 'var(--db-text-primary)', display: 'block' }}>
                      {subInfo?.tenant_name || '-'}
                    </strong>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                      Domain Travel
                    </label>
                    <span style={{ fontSize: '14px', color: 'var(--db-text-primary)', display: 'block' }}>
                      {subInfo?.tenant_slug ? `${subInfo.tenant_slug}.klikumroh.id` : '-'}
                    </span>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                      Email Administrator
                    </label>
                    <span style={{ fontSize: '14px', color: 'var(--db-text-primary)', display: 'block' }}>
                      {currentUser?.email || '-'}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* KOLOM KANAN: RINGKASAN TAGIHAN & AKSI */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  backgroundColor: 'var(--db-card-bg)',
                  border: '1px solid var(--db-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '24px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--db-font-heading)',
                    fontSize: '17px',
                    fontWeight: 700,
                    color: 'var(--db-text-primary)',
                    margin: '0 0 16px 0',
                  }}
                >
                  Ringkasan Tagihan
                </h3>

                {selectedPlan && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--db-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--db-border)',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                        {selectedPlan.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginTop: '2px' }}>
                        Perpanjangan lisensi: +{selectedPlan.period_months} Bulan
                      </div>
                    </div>

                    {/* Kupon Promo Input */}
                    <div style={{ marginTop: '8px' }}>
                      <label
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--db-text-primary)',
                          display: 'block',
                          marginBottom: '6px',
                        }}
                      >
                        Punya Kupon Promo?
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <FormInput
                          name="coupon_code"
                          placeholder="Kode kupon"
                          value={couponCodeInput}
                          onChange={(e) => {
                            setCouponCodeInput(e.target.value.toUpperCase());
                            setValidatedCoupon(null);
                            setCouponError(null);
                          }}
                          disabled={couponValidating}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleApplyCoupon}
                          disabled={couponValidating || !couponCodeInput.trim()}
                          style={{ flexShrink: 0, fontSize: '12px', padding: '6px 14px' }}
                        >
                          {couponValidating ? 'Mengecek...' : 'Terapkan'}
                        </Button>
                      </div>

                      {validatedCoupon && (
                        <div
                          style={{
                            marginTop: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'var(--db-sidebar-active-highlight)',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          <CheckCircle2 size={14} />
                          <span>Kupon {validatedCoupon.code} aktif ({validatedCoupon.discount_percentage}% off)</span>
                        </div>
                      )}

                      {couponError && (
                        <div
                          style={{
                            marginTop: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'var(--db-negative)',
                            fontSize: '12px',
                          }}
                        >
                          <AlertCircle size={14} />
                          <span>{couponError}</span>
                        </div>
                      )}
                    </div>

                    {/* Rincian Harga */}
                    <div
                      style={{
                        borderTop: '1px solid var(--db-border)',
                        paddingTop: '14px',
                        marginTop: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--db-text-muted)' }}>
                        <span>Harga Paket</span>
                        <span>
                          {new Intl.NumberFormat('id-ID', {
                            style: 'currency',
                            currency: 'IDR',
                            minimumFractionDigits: 0,
                          }).format(selectedPlan.price)}
                        </span>
                      </div>

                      {validatedCoupon && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--db-sidebar-active-highlight)', fontWeight: 500 }}>
                          <span>Diskon Kupon ({validatedCoupon.discount_percentage}%)</span>
                          <span>
                            -
                            {new Intl.NumberFormat('id-ID', {
                              style: 'currency',
                              currency: 'IDR',
                              minimumFractionDigits: 0,
                            }).format(discountAmount)}
                          </span>
                        </div>
                      )}

                      <div
                        style={{
                          borderTop: '1px solid var(--db-border)',
                          paddingTop: '10px',
                          marginTop: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--db-text-primary)' }}>
                          Total Pembayaran
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--db-font-heading)',
                            fontSize: '20px',
                            fontWeight: 800,
                            color: 'var(--db-sidebar-active-highlight)',
                          }}
                        >
                          {new Intl.NumberFormat('id-ID', {
                            style: 'currency',
                            currency: 'IDR',
                            minimumFractionDigits: 0,
                          }).format(finalAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Tombol Buat Tagihan */}
                    <div style={{ marginTop: '16px' }}>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleCreateInvoice}
                        disabled={submitting}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontSize: '14px',
                          padding: '12px 18px',
                        }}
                      >
                        <span>{submitting ? 'Membuat Tagihan...' : 'Lanjutkan ke Pembayaran'}</span>
                        <ArrowRight size={16} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Security Note */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  backgroundColor: 'var(--db-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                  fontSize: '12px',
                  color: 'var(--db-text-muted)',
                }}
              >
                <ShieldCheck size={16} style={{ color: 'var(--db-sidebar-active-highlight)', flexShrink: 0 }} />
                <span>Masa aktif lisensi akan otomatis bertambah setelah pembayaran diverifikasi oleh tim KlikUmroh.</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

