// Langganan: current plan, open invoice, plan picker to renew or activate, invoice history.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ReceiptText } from 'lucide-react';
import {
  createRenewalInvoice,
  fetchPricingPlansForRenewal,
  fetchTenantSubscription,
  validateCoupon,
  type PaymentVerification,
  type SubscriptionPricingPlan,
  type TenantSubscriptionInfo,
} from '../../services/api';
import { Banner, Button, DataTable, EmptyState, Field, Pill, fmtDate, fmtRupiah, type Column, type PillTone, errorText } from '../../ui';

export const INVOICE_STATUS: Record<PaymentVerification['status'], { label: string; tone: PillTone }> = {
  pending: { label: 'Menunggu pembayaran', tone: 'amber' },
  approved: { label: 'Lunas', tone: 'green' },
  rejected: { label: 'Ditolak', tone: 'red' },
  cancelled: { label: 'Dibatalkan', tone: 'gray' },
};

/** A pending invoice with a proof is waiting for KlikUmroh, not for the travel. */
export const invoiceStatus = (pv: PaymentVerification) =>
  pv.status === 'pending' && pv.proof_url ? { label: 'Sedang diverifikasi', tone: 'blue' as PillTone } : INVOICE_STATUS[pv.status];

export const periodLabel = (months?: number | null) => {
  if (!months) return '';
  if (months % 12 === 0) return `${months / 12} tahun`;
  return `${months} bulan`;
};

/** "Paket Premium · 12 bulan", or just the name when it already says the period (e.g. "3 Bulan"). */
export const planTitle = (name?: string | null, months?: number | null) => {
  const period = periodLabel(months);
  if (!name) return period;
  const n = name.toLowerCase();
  const said = n.includes(period) || (months ? n.includes(`${months} bulan`) : false);
  return period && !said ? `${name} · ${period}` : name;
};

function planState(sub: TenantSubscriptionInfo): { label: string; tone: PillTone; text: string } {
  if (sub.status === 'pending') return { label: 'Belum aktif', tone: 'amber', text: 'Website travel aktif setelah pembayaran aktivasi diverifikasi.' };
  if (sub.is_suspended) return { label: 'Ditangguhkan', tone: 'red', text: 'Website travel tidak tampil. Selesaikan pembayaran untuk mengaktifkan kembali.' };
  if (sub.is_subscription_expired)
    return { label: 'Masa tenggang', tone: 'amber', text: `Berakhir ${fmtDate(sub.subscription_expires_at)}. Website ditangguhkan dalam ${sub.grace_period_days_remaining} hari.` };
  if (sub.subscription_expires_at) return { label: 'Aktif', tone: 'green', text: `Aktif sampai ${fmtDate(sub.subscription_expires_at)}, sisa ${sub.days_remaining} hari.` };
  return { label: sub.is_active ? 'Aktif' : 'Tidak aktif', tone: sub.is_active ? 'green' : 'gray', text: '' };
}

export const BillingSettings: React.FC = () => {
  const navigate = useNavigate();
  const [sub, setSub] = useState<TenantSubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<SubscriptionPricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [planId, setPlanId] = useState<number | null>(null);
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState<{ code: string; pct: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([fetchTenantSubscription(true), fetchPricingPlansForRenewal()])
      .then(([s, p]) => {
        setSub(s);
        setPlans(p);
        setPlanId(s.pending_verification?.plan_id ?? s.current_plan_id ?? p[0]?.id ?? null);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat data')))
      .finally(() => setLoading(false));
  }, []);

  const plan = plans.find((p) => p.id === planId) || null;
  const total = useMemo(() => {
    if (!plan) return 0;
    return discount ? Math.max(0, Math.round(plan.price - (discount.pct / 100) * plan.price)) : plan.price;
  }, [plan, discount]);

  const choosePlan = (id: number) => {
    setPlanId(id);
    // A coupon can be limited to one plan: validate it again for the new choice.
    setDiscount(null);
    setCouponError(null);
  };

  const applyCoupon = async () => {
    if (!coupon.trim() || !planId) return;
    setChecking(true);
    setCouponError(null);
    try {
      const r = await validateCoupon(coupon.trim().toUpperCase(), planId);
      setDiscount({ code: r.code, pct: r.discount_percentage });
    } catch (e) {
      setDiscount(null);
      setCouponError(errorText(e, 'Kupon tidak valid'));
    } finally {
      setChecking(false);
    }
  };

  const createInvoice = async () => {
    if (!planId) return;
    setCreating(true);
    setError(null);
    try {
      const r = await createRenewalInvoice(planId, discount?.code);
      navigate(`/settings/subscription/payment/${r.payment_verification.id}`);
    } catch (e) {
      setError(errorText(e, 'Gagal membuat tagihan'));
      setCreating(false);
    }
  };

  if (loading) return <div className="st-loading" aria-busy="true" />;
  if (!sub) return <Banner tone="danger">{error || 'Gagal memuat langganan.'}</Banner>;

  const state = planState(sub);
  const open = sub.pending_verification || null;
  const showPicker = picking || (!open && (sub.status === 'pending' || sub.should_show_renewal_invoice || sub.is_suspended));

  const columns: Column<PaymentVerification>[] = [
    { key: 'date', header: 'Tanggal', cell: (r) => fmtDate(r.created_at) },
    { key: 'plan', header: 'Paket', cell: (r) => planTitle(r.plan_name, r.plan_period_months) || '—' },
    { key: 'amount', header: 'Jumlah', align: 'right', cell: (r) => fmtRupiah(r.final_amount) },
    { key: 'status', header: 'Status', cell: (r) => { const s = invoiceStatus(r); return <Pill tone={s.tone}>{s.label}</Pill>; } },
  ];

  return (
    <div className="st-stack">
      {error && <Banner tone="danger">{error}</Banner>}

      <div className="st-plan">
        <div className="st-plan__main">
          <div className="st-plan__label">Paket saat ini</div>
          <div className="st-plan__name">
            {sub.current_plan_name ? planTitle(sub.current_plan_name, sub.current_plan_period_months) : 'Belum ada paket aktif'}
            <Pill tone={state.tone}>{state.label}</Pill>
          </div>
          {state.text && <p className="st-plan__text">{state.text}</p>}
        </div>
        {!showPicker && !open && (
          <Button variant="primary" onClick={() => setPicking(true)}>
            Perpanjang langganan
          </Button>
        )}
      </div>

      {open && (
        <div className="st-invoice-row">
          <ReceiptText className="ku-icon" aria-hidden="true" />
          <div className="st-invoice-row__text">
            <b>{open.proof_url ? 'Bukti transfer sedang diverifikasi' : 'Tagihan menunggu pembayaran'}</b>
            <span>
              {planTitle(open.plan_name, open.plan_period_months)} · {fmtRupiah(open.final_amount)}
            </span>
          </div>
          {!open.proof_url && !picking && (
            <Button variant="ghost" onClick={() => setPicking(true)}>
              Ganti paket
            </Button>
          )}
          <Button variant={open.proof_url || picking ? 'secondary' : 'primary'} to={`/settings/subscription/payment/${open.id}`} icon={<ArrowRight className="ku-icon--sm" />}>
            {open.proof_url ? 'Lihat tagihan' : 'Bayar sekarang'}
          </Button>
        </div>
      )}

      {showPicker && (
        <section className="st-picker" aria-labelledby="st-picker-title">
          <div className="st-picker__head">
            <h2 id="st-picker-title" className="st-section__title">{sub.status === 'pending' ? 'Pilih paket aktivasi' : 'Pilih paket perpanjangan'}</h2>
            {picking && (
              <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
                Tutup
              </Button>
            )}
          </div>
          {plans.length === 0 ? (
            <EmptyState compact title="Belum ada paket langganan" description="Hubungi tim KlikUmroh untuk mengaktifkan langganan." />
          ) : (
            <div className="st-plans" role="radiogroup" aria-label="Paket langganan">
              {plans.map((p) => (
                <label key={p.id} className={`st-plan-opt${p.id === planId ? ' st-plan-opt--on' : ''}`}>
                  <input type="radio" name="plan" checked={p.id === planId} onChange={() => choosePlan(p.id)} />
                  <span className="st-plan-opt__name">{p.name}</span>
                  {planTitle(p.name, p.period_months) !== p.name && <span className="st-plan-opt__period">{periodLabel(p.period_months)}</span>}
                  <span className="st-plan-opt__price">{fmtRupiah(p.price)}</span>
                  {p.period_months > 1 && <span className="st-plan-opt__month">{fmtRupiah(p.price / p.period_months)} per bulan</span>}
                </label>
              ))}
            </div>
          )}

          {plan && (
            <div className="st-checkout">
              <Field label="Kode kupon" optional error={couponError} hint={discount ? `Diskon ${discount.pct}% diterapkan.` : undefined}>
                {(id) => (
                  <div className="st-coupon">
                    <input
                      id={id}
                      className="ku-input"
                      value={coupon}
                      onChange={(e) => {
                        setCoupon(e.target.value.toUpperCase());
                        setDiscount(null);
                        setCouponError(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyCoupon())}
                      aria-invalid={Boolean(couponError)}
                    />
                    <Button variant="secondary" onClick={applyCoupon} disabled={!coupon.trim() || checking}>
                      {checking ? 'Memeriksa...' : 'Pakai'}
                    </Button>
                  </div>
                )}
              </Field>
              <dl className="st-total">
                <div>
                  <dt>{planTitle(plan.name, plan.period_months)}</dt>
                  <dd>{fmtRupiah(plan.price)}</dd>
                </div>
                {discount && (
                  <div>
                    <dt>Kupon {discount.code}</dt>
                    <dd>−{fmtRupiah(plan.price - total)}</dd>
                  </div>
                )}
                <div className="st-total__sum">
                  <dt>Total</dt>
                  <dd>{fmtRupiah(total)}</dd>
                </div>
              </dl>
              <p className="st-muted">
                {open ? "Tagihan yang belum dibayar diganti dengan paket ini. " : ""}Tagihan mendapat kode unik 3 digit agar transfer Anda mudah dicocokkan.
              </p>
              <div className="st-checkout__actions">
                <Button variant="primary" onClick={createInvoice} disabled={creating}>
                  {creating ? 'Membuat tagihan...' : 'Buat tagihan'}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="st-block">
        <h2 className="st-section__title">Riwayat tagihan</h2>
        <DataTable
          columns={columns}
          rows={sub.payment_verifications || []}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/settings/subscription/payment/${r.id}`)}
          empty={<EmptyState compact title="Belum ada tagihan" />}
        />
      </section>
    </div>
  );
};
