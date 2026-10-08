import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { AdminDataGrid, type AdminColumn } from '../components/AdminDataGrid';
import {
  fetchPricingPlans,
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  setPricingPlanPromo,
  type PricingPlan,
  type PricingPlanInput,
} from '../../../services/staffApi';
import { Tooltip } from '../shared/Tooltip';
import { MoneyInput } from '../../../ui';

/** Highest plan price the server accepts (service.MaxPlanPrice). */
const MAX_PLAN_PRICE = 1_000_000_000;

/** Promo percent as typed: up to two digits, optionally a dot or comma and two decimals ("12", "12,5"). */
const cleanPercentInput = (v: string): string => {
  const m = v.replace(',', '.').replace(/[^\d.]/g, '').match(/^\d{0,2}(\.\d{0,2})?/);
  return m ? m[0] : '';
};

/** Today's date in WIB as YYYY-MM-DD (promo end dates are WIB calendar days). */
const todayWIB = (): string => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export const AdminPlansView: React.FC = () => {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);
  const [formData, setFormData] = useState<PricingPlanInput>({
    name: '',
    period_months: 1,
    price: 0,
    is_public: true,
  });
  const [submitting, setSubmitting] = useState(false);
  // The admin types the price per month; the plan price saved (and billed) is that times the duration.
  const [monthly, setMonthly] = useState<number | null>(null);
  const [monthlyTouched, setMonthlyTouched] = useState(false);
  // Promo for new travels' first payment (founder decision 7 Oct 2026): percent as typed (empty = none) and
  // an optional last day (YYYY-MM-DD).
  const [promoPercent, setPromoPercent] = useState('');
  const [promoEndsAt, setPromoEndsAt] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPricingPlans();
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat katalog paket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val);
  };

  // "2026-12-31" -> "31 Des 2026"
  const formatDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  // Plan price to save: monthly price x duration. An older plan whose price does not divide evenly by its
  // duration keeps its exact price until the admin changes the monthly price or the duration.
  const legacyInexact = editingPlan !== null && editingPlan.price % editingPlan.period_months !== 0;
  const keepLegacyPrice = legacyInexact && !monthlyTouched && formData.period_months === editingPlan?.period_months;
  const totalPrice = keepLegacyPrice && editingPlan ? editingPlan.price : (monthly ?? 0) * formData.period_months;

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setMonthly(null);
    setMonthlyTouched(false);
    setFormData({ name: '', period_months: 1, price: 0, is_public: true });
    setPromoPercent('');
    setPromoEndsAt('');
    setShowModal(true);
  };

  const handleOpenEdit = (plan: PricingPlan) => {
    setEditingPlan(plan);
    setMonthly(plan.price > 0 ? Math.round(plan.price / plan.period_months) : null);
    setMonthlyTouched(false);
    setFormData({
      name: plan.name,
      period_months: plan.period_months,
      price: plan.price,
      is_public: plan.is_public !== false,
    });
    setPromoPercent(plan.promo_percent ? String(plan.promo_percent) : '');
    setPromoEndsAt(plan.promo_ends_at || '');
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Yakin ingin menghapus paket langganan ini?')) return;
    try {
      setLoading(true);
      await deletePricingPlan(id);
      setSuccessMessage('Paket langganan berhasil dihapus');
      loadData();
    } catch (err: any) {
      alert('Gagal menghapus paket: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Price 0 is a valid free plan (the backend only rejects a negative price), so it must stay editable.
    if (!formData.name.trim() || !Number.isFinite(totalPrice) || totalPrice < 0 || formData.period_months <= 0) {
      alert('Mohon lengkapi semua field dengan benar');
      return;
    }
    if (totalPrice > MAX_PLAN_PRICE) {
      alert(`Total harga paket (harga per bulan x durasi) maksimal ${formatIDR(MAX_PLAN_PRICE)}.`);
      return;
    }

    const promo = promoPercent.trim() === '' ? null : Number(promoPercent.replace(',', '.'));
    if (promo !== null && (!Number.isFinite(promo) || promo < 1 || promo > 99)) {
      alert('Promo harus 1 sampai 99 persen, atau kosongkan untuk tanpa promo.');
      return;
    }

    const endsAt = promo ? promoEndsAt || null : null;
    const promoChanged = (editingPlan?.promo_percent ?? null) !== promo || (editingPlan?.promo_ends_at ?? null) !== endsAt;
    // Checked before anything is saved: a refused promo after the plan was created left the modal in
    // create mode, so saving again made a second plan (audit 7 Oct 2026).
    if (promoChanged && endsAt && endsAt < todayWIB()) {
      alert('Tanggal berakhir promo sudah lewat.');
      return;
    }

    try {
      setSubmitting(true);
      let saved: PricingPlan;
      if (editingPlan) {
        saved = await updatePricingPlan(editingPlan.id, { ...formData, price: totalPrice });
      } else {
        saved = await createPricingPlan({ ...formData, price: totalPrice });
        setEditingPlan(saved); // a retry after a failed promo save edits this plan instead of creating another
      }
      if (promoChanged) {
        await setPricingPlanPromo(saved.id, promo, endsAt);
      }
      setSuccessMessage(editingPlan ? 'Paket langganan berhasil diperbarui' : 'Paket langganan baru berhasil ditambahkan');
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert('Gagal menyimpan paket: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: AdminColumn<PricingPlan>[] = [
    {
      key: 'id',
      label: 'ID',
      width: '60px',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--sa-text-muted)', fontSize: '13px' }}>
          #{row.id}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Nama Paket',
      render: (row) => (
        <span className="sa-plan-name">
          <span style={{ fontWeight: 600, color: 'var(--sa-text)' }}>{row.name}</span>
          {row.is_public === false && <span className="sa-badge sa-badge--neutral">Tersembunyi</span>}
        </span>
      ),
    },
    {
      key: 'period_months',
      label: 'Durasi Masa Aktif',
      render: (row) => (
        <span className="sa-badge sa-badge--neutral">
          {row.period_months} Bulan
        </span>
      ),
    },
    {
      key: 'price',
      label: 'Harga Paket',
      render: (row) => (
        <span className="sa-plan-price">
          <strong style={{ fontFamily: 'var(--sa-font-display)', color: 'var(--sa-text)' }}>
            {formatIDR(row.price)}
          </strong>
          {row.promo_percent ? (
            <span className={row.promo_active ? 'sa-badge sa-badge--active' : 'sa-badge sa-badge--neutral'}>
              {row.promo_active ? `Promo ${row.promo_percent}% ${formatIDR(row.promo_price ?? row.price)}` : `Promo ${row.promo_percent}% berakhir`}
              {row.promo_ends_at ? ` s/d ${formatDay(row.promo_ends_at)}` : ''}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Aksi',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="sa-btn sa-btn--secondary sa-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(row);
            }}
          >
            <Edit2 size={12} />
            <span>Edit</span>
          </button>
          <button
            type="button"
            className="sa-btn sa-btn--danger sa-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Paket Langganan"
      subtitle="Katalog tier harga dan durasi langganan platform KlikUmroh"
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="sa-btn sa-btn--secondary"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            className="sa-btn sa-btn--primary"
            onClick={handleOpenCreate}
          >
            <Plus size={14} />
            <span>Tambah Paket</span>
          </button>
        </div>
      }
    >
      {successMessage && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-green-bg)',
            border: '1px solid var(--sa-green-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--db-status-closing)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--db-status-lost)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <AdminDataGrid
        title="Daftar Paket"
        data={plans}
        columns={columns}
        loading={loading}
        searchPlaceholder="Cari nama paket..."
        searchKeys={['name']}
        emptyMessage="Belum ada paket langganan yang dikonfigurasi"
      />

      {/* Modal Tambah / Edit Paket */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--sa-overlay-modal)',
            backdropFilter: 'blur(3px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--sa-card)',
              borderRadius: 'var(--sa-radius-md)',
              maxWidth: '420px',
              width: '100%',
              padding: '24px',
              boxShadow: 'var(--sa-shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>
              {editingPlan ? 'Ubah Paket Langganan' : 'Tambah Paket Baru'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              Konfigurasi nama tier, durasi bulan, dan nominal harga IDR.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Nama Paket:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Paket Pro Tahunan"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: 'var(--db-text-input)',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Durasi Periode (Bulan):
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.period_months}
                  onChange={(e) => setFormData({ ...formData, period_months: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: 'var(--db-text-input)',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="plan-price" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Harga per Bulan (IDR):
                </label>
                <MoneyInput
                  id="plan-price"
                  value={monthly}
                  onChange={(v) => {
                    setMonthlyTouched(true);
                    setMonthly(v);
                  }}
                  placeholder="0"
                />
                <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
                  Total harga paket: <strong style={{ color: 'var(--sa-text)' }}>{formatIDR(totalPrice)}</strong> untuk {formData.period_months || 0} bulan
                  {keepLegacyPrice ? ' (harga lama, tidak habis dibagi durasi)' : ''}.
                </p>
              </div>

              <div className="sa-promo">
                <div className="sa-promo__head">
                  <span className="sa-promo__title">Promo travel baru</span>
                  <Tooltip
                    align="left"
                    content="Potongan harga untuk pembayaran pertama travel baru. Perpanjangan tetap harga normal. Kupon (termasuk kupon affiliator) dihitung dari harga setelah promo. Tagihan yang sudah dibuat tetap memakai promo saat tagihan dibuat. Kosongkan persen untuk mematikan promo."
                  />
                </div>
                <div className="sa-promo__row">
                  <label className="sa-promo__field">
                    <span>Potongan (%)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Tanpa promo"
                      value={promoPercent}
                      onChange={(e) => setPromoPercent(cleanPercentInput(e.target.value))}
                    />
                  </label>
                  <label className="sa-promo__field">
                    <span>Berakhir (opsional)</span>
                    <input type="date" min={todayWIB()} value={promoEndsAt} disabled={!promoPercent.trim()} onChange={(e) => setPromoEndsAt(e.target.value)} />
                  </label>
                </div>
                {Number(promoPercent) > 0 && Number(promoPercent) < 100 && totalPrice > 0 && (
                  <p className="sa-promo__note">
                    Travel baru membayar {formatIDR(Math.round(totalPrice * (1 - Number(promoPercent) / 100)))}
                    {promoEndsAt ? ` sampai ${formatDay(promoEndsAt)}` : ', tanpa batas waktu'}.
                  </p>
                )}
              </div>

              <div className="sa-check">
                <label className="sa-check__label">
                  <input
                    type="checkbox"
                    checked={formData.is_public}
                    onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                  />
                  <span>Tampil untuk travel</span>
                </label>
                <Tooltip
                  align="left"
                  content="Paket tersembunyi tidak muncul di halaman Langganan travel dan tidak bisa dipilih travel. Travel yang sedang memakai paket ini tetap melihatnya dan bisa memperpanjang. Cocok untuk paket khusus satu travel (gratis, uji coba, harga khusus)."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="sa-btn sa-btn--secondary"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sa-btn sa-btn--primary"
                  disabled={submitting}
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Paket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
