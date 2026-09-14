import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Info,
  AlertTriangle,
  ContactRound,
  UserRound,
  Phone,
  Package,
  ChevronDown,
  Minus,
  Plus,
  Users,
  Waypoints,
  RefreshCw,
  ShieldCheck,
  CircleCheck,
  History,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  getStandardMenuItems,
} from '../components';
import {
  type PackageItem,
  type ProspectDetailResponse,
  fetchProspectDetail,
  fetchPackages,
  updateProspect,
  getStoredUser,
} from '../services/api';
import './ProspectEdit.css';

const formatStatusLabel = (status: string): string => {
  switch (status) {
    case 'baru':
      return 'Baru';
    case 'dihubungi':
      return 'Dihubungi';
    case 'tertarik':
      return 'Tertarik';
    case 'closing':
      return 'Closing';
    case 'tidak_lanjut':
      return 'Tidak Lanjut';
    default:
      return status;
  }
};

const formatIDR = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

const formatShortDate = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

const getInitials = (n: string): string => {
  if (!n) return 'PR';
  const parts = n.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return n.slice(0, 2).toUpperCase();
};

export const ProspectEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const prospectId = id ? parseInt(id, 10) : 0;

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [initialDetail, setInitialDetail] = useState<ProspectDetailResponse | null>(null);

  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [packageId, setPackageId] = useState<string>('');
  const [jumlahJamaah, setJumlahJamaah] = useState<number>(1);
  const [correctionReason, setCorrectionReason] = useState<string>('');

  const currentUser = getStoredUser();

  const loadData = async () => {
    if (!prospectId) return;
    try {
      setLoading(true);
      setError(null);
      const [detail, pkgs] = await Promise.all([
        fetchProspectDetail(prospectId),
        fetchPackages(),
      ]);
      setInitialDetail(detail);
      setPackages(pkgs);

      setName(detail.prospect.name || '');
      setPhone(detail.prospect.phone || '');
      setPackageId(detail.prospect.package_id ? String(detail.prospect.package_id) : '');
      setJumlahJamaah(
        detail.prospect.jumlah_jamaah && detail.prospect.jumlah_jamaah > 0
          ? detail.prospect.jumlah_jamaah
          : 1
      );
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data prospek');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [prospectId]);

  const isClosing = initialDetail?.prospect.status === 'closing';
  const initialJamaahVal =
    initialDetail?.prospect.jumlah_jamaah && initialDetail.prospect.jumlah_jamaah > 0
      ? initialDetail.prospect.jumlah_jamaah
      : 1;
  const isJamaahChangedOnClosing = isClosing && jumlahJamaah !== initialJamaahVal;

  const selectedPkg = packages.find((p) => String(p.id) === packageId);
  const unitPrice = selectedPkg?.price || 0;
  const unitCommission = selectedPkg?.commission_amount || 0;
  const totalTransaction = unitPrice * (jumlahJamaah || 1);
  const totalCommission = unitCommission * (jumlahJamaah || 1);

  const handleDecrement = () => {
    setJumlahJamaah((prev) => Math.max(1, prev - 1));
  };

  const handleIncrement = () => {
    setJumlahJamaah((prev) => prev + 1);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setError('Nama lengkap prospek wajib diisi');
      return;
    }
    if (!phone.trim()) {
      setError('Nomor WhatsApp prospek wajib diisi');
      return;
    }
    if (isJamaahChangedOnClosing && !correctionReason.trim()) {
      setError('Alasan koreksi komisi wajib diisi saat mengubah jumlah jamaah pada prospek closing');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        package_id: packageId ? parseInt(packageId, 10) : null,
        jumlah_jamaah: jumlahJamaah || 1,
        correction_reason: isJamaahChangedOnClosing ? correctionReason.trim() : undefined,
      };

      await updateProspect(prospectId, payload);
      navigate(`/prospects/${prospectId}`);
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui prospek');
    } finally {
      setSubmitting(false);
    }
  };

  const menuItems = getStandardMenuItems('prospects');
  const prospectStatus = initialDetail?.prospect.status || 'baru';
  const paddedId = `ID #${String(prospectId).padStart(4, '0')}`;

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: '1200px' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '360px',
                color: 'var(--db-text-muted)',
                gap: '10px',
              }}
            >
              <RefreshCw size={24} className="db-spin" />
              <span>Memuat formulir edit prospek...</span>
            </div>
          ) : (
            <div className="db-prospect-edit-page">
              {/* 1. Header Area */}
              <div className="db-prospect-edit-header">
                <div className="db-prospect-edit-header__left">
                  <button
                    type="button"
                    className="db-back-btn"
                    onClick={() => navigate(`/prospects/${prospectId}`)}
                    title="Kembali ke Detail Prospek"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="db-prospect-edit-header__copy">
                    <h1 className="db-prospect-edit-title">Edit Data Prospek</h1>
                    <div className="db-prospect-edit-meta">
                      <span className="db-prospect-edit-meta__name">
                        {name || initialDetail?.prospect.name || 'Hj. Maryam'}
                      </span>
                      <span className="db-prospect-edit-meta__divider"></span>
                      <span className="db-prospect-edit-meta__id">{paddedId}</span>
                    </div>
                  </div>
                </div>

                <div className="db-prospect-edit-header__actions">
                  <button
                    type="button"
                    className="db-btn-cancel"
                    onClick={() => navigate(`/prospects/${prospectId}`)}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="db-btn-save"
                    onClick={() => handleSubmit()}
                    disabled={submitting}
                  >
                    <Save size={14} />
                    <span>{submitting ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                  </button>
                </div>
              </div>

              {/* 2. Notice Banner */}
              <div className="db-edit-notice-banner">
                <Info size={15} className="db-edit-notice-banner__icon" />
                <span className="db-edit-notice-banner__text">
                  Setiap perubahan data prospek tercatat otomatis pada log aktivitas.
                </span>
                <span className="db-edit-notice-banner__badge">LOG AUDIT</span>
              </div>

              {/* Warning if Closing */}
              {isClosing && (
                <div className="db-edit-closing-warning">
                  <AlertTriangle size={18} className="db-edit-closing-warning__icon" />
                  <div className="db-edit-closing-warning__content">
                    <span className="db-edit-closing-warning__title">
                      Perhatian: Prospek Berstatus Closing
                    </span>
                    <span className="db-edit-closing-warning__desc">
                      Prospek ini sudah Closing. Perubahan <strong>Jumlah Jamaah</strong> akan otomatis membuat entri koreksi komisi di buku kas tanpa menghapus catatan awal.
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="db-alert db-alert--error" style={{ marginBottom: '0' }}>
                  <span>{error}</span>
                </div>
              )}

              {/* 3. Two-Column Layout */}
              <div className="db-prospect-edit-columns">
                {/* Left: Form Card */}
                <div className="db-prospect-edit-main">
                  <form onSubmit={handleSubmit} className="db-edit-form-card">
                    <div className="db-edit-form-card__header">
                      <h2 className="db-edit-form-card__title">Formulir Data Prospek</h2>
                      <span className="db-edit-form-card__subtitle">
                        Pastikan data sesuai konfirmasi calon jamaah.
                      </span>
                    </div>

                    <div className="db-edit-form-card__body">
                      {/* Section 1: Identitas dan kontak */}
                      <div className="db-edit-section">
                        <div className="db-edit-section__title">
                          <ContactRound size={15} className="db-edit-section__icon" />
                          <span>Identitas & Kontak</span>
                        </div>

                        <div className="db-edit-fields-row">
                          {/* Nama Lengkap */}
                          <div className="db-edit-field">
                            <div className="db-edit-field__label-row">
                              <label className="db-edit-field__label">Nama Lengkap</label>
                              <span className="db-edit-field__required">Wajib</span>
                            </div>
                            <div className="db-edit-field__input-wrap">
                              <UserRound size={14} className="db-edit-field__icon" />
                              <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Contoh: Hj. Maryam"
                                className="db-edit-field__input"
                              />
                            </div>
                            <span className="db-edit-field__hint">
                              Nama calon jamaah yang dapat dihubungi.
                            </span>
                          </div>

                          {/* Nomor WhatsApp */}
                          <div className="db-edit-field">
                            <div className="db-edit-field__label-row">
                              <label className="db-edit-field__label">Nomor WhatsApp</label>
                              <span className="db-edit-field__required">Wajib</span>
                            </div>
                            <div className="db-edit-field__input-wrap">
                              <Phone size={14} className="db-edit-field__icon" />
                              <input
                                type="text"
                                required
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="0812 3456 7890"
                                className="db-edit-field__input"
                              />
                            </div>
                            <span className="db-edit-field__hint">
                              Nomor WhatsApp aktif (contoh: 08123456789).
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="db-edit-form-divider"></div>

                      {/* Section 2: Paket dan jumlah jamaah */}
                      <div className="db-edit-section">
                        <div className="db-edit-section__title">
                          <Package size={15} className="db-edit-section__icon" />
                          <span>Paket & Jumlah Jamaah</span>
                        </div>

                        <div className="db-edit-fields-row">
                          {/* Paket Umroh */}
                          <div className="db-edit-field">
                            <div className="db-edit-field__label-row">
                              <label className="db-edit-field__label">Paket Umroh</label>
                              <span className="db-edit-field__required">Wajib</span>
                            </div>
                            <div className="db-edit-field__input-wrap">
                              <Package size={14} className="db-edit-field__icon" />
                              <select
                                value={packageId}
                                onChange={(e) => setPackageId(e.target.value)}
                                className="db-edit-field__select"
                              >
                                <option value="">-- Pilih Paket Umroh --</option>
                                {packages.map((pkg) => (
                                  <option key={pkg.id} value={pkg.id}>
                                    {pkg.name} {pkg.price ? `(${formatIDR(pkg.price)})` : ''}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={13} className="db-edit-field__icon" />
                            </div>
                            <span className="db-edit-field__hint">
                              {selectedPkg
                                ? `${formatShortDate(selectedPkg.departure_date) || 'Jadwal fleksibel'} · ${formatIDR(selectedPkg.price || 0)}`
                                : 'Pilih paket umroh yang diminati.'}
                            </span>
                          </div>

                          {/* Jumlah Jamaah (Stepper) */}
                          <div className="db-edit-field">
                            <div className="db-edit-field__label-row">
                              <label className="db-edit-field__label">Jumlah Jamaah</label>
                              <span className="db-edit-field__required">Wajib</span>
                            </div>
                            <div className="db-edit-stepper">
                              <button
                                type="button"
                                onClick={handleDecrement}
                                disabled={jumlahJamaah <= 1}
                                className="db-edit-stepper__btn db-edit-stepper__btn--dec"
                                title="Kurangi jumlah jamaah"
                              >
                                <Minus size={13} />
                              </button>
                              <div className="db-edit-stepper__display">
                                <span className="db-edit-stepper__value">{jumlahJamaah}</span>
                                <span className="db-edit-stepper__unit">jamaah</span>
                              </div>
                              <button
                                type="button"
                                onClick={handleIncrement}
                                className="db-edit-stepper__btn db-edit-stepper__btn--inc"
                                title="Tambah jumlah jamaah"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                            <span className="db-edit-field__hint">
                              Menentukan total transaksi dan komisi agen.
                            </span>
                          </div>
                        </div>

                        {/* Alasan Koreksi (if Closing & Jamaah changed) */}
                        {isJamaahChangedOnClosing && (
                          <div className="db-edit-field" style={{ marginTop: '4px' }}>
                            <div className="db-edit-field__label-row">
                              <label className="db-edit-field__label">
                                Alasan Koreksi Komisi *
                              </label>
                              <span className="db-edit-field__required">Wajib</span>
                            </div>
                            <div
                              className="db-edit-field__input-wrap"
                              style={{ height: 'auto', padding: '10px 12px' }}
                            >
                              <textarea
                                required
                                rows={2}
                                value={correctionReason}
                                onChange={(e) => setCorrectionReason(e.target.value)}
                                placeholder="Contoh: Penambahan 1 anggota keluarga sesuai bukti transfer susulan"
                                className="db-edit-field__input"
                                style={{ resize: 'vertical' }}
                              />
                            </div>
                            <span className="db-edit-field__hint">
                              Tercatat permanen pada mutasi komisi agen.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Financial Impact Banner */}
                      <div className="db-edit-financial-banner">
                        <div className="db-edit-financial-stat">
                          <span className="db-edit-financial-stat__label">Estimasi Total Transaksi</span>
                          <span className="db-edit-financial-stat__value">
                            {formatIDR(totalTransaction)}
                          </span>
                        </div>
                        <div className="db-edit-financial-stat">
                          <span className="db-edit-financial-stat__label">Estimasi Komisi Agen</span>
                          <span className="db-edit-financial-stat__value">
                            {unitCommission > 0
                              ? formatIDR(totalCommission)
                              : 'Komisi belum diatur'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="db-edit-form-card__footer">
                      <button
                        type="button"
                        className="db-btn-cancel"
                        onClick={() => navigate(`/prospects/${prospectId}`)}
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="db-btn-save"
                        disabled={submitting}
                      >
                        <Save size={13} />
                        <span>{submitting ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Right: Sidebar Cards */}
                <div className="db-prospect-edit-sidebar">
                  {/* Card 1: Data saat ini */}
                  <div className="db-edit-sidebar-card">
                    <div className="db-edit-sidebar-card__header">
                      <h3 className="db-edit-sidebar-card__title">Data Saat Ini</h3>
                      <div className={`db-edit-sidebar-status db-edit-sidebar-status--${prospectStatus}`}>
                        <span className="db-edit-sidebar-status__dot"></span>
                        <span>{formatStatusLabel(prospectStatus)}</span>
                      </div>
                    </div>

                    <div className="db-edit-sidebar-identity">
                      <div className={`db-edit-sidebar-avatar db-edit-sidebar-avatar--${prospectStatus}`}>
                        {getInitials(initialDetail?.prospect.name || name)}
                      </div>
                      <div className="db-edit-sidebar-identity__copy">
                        <span className="db-edit-sidebar-identity__name">
                          {initialDetail?.prospect.name || 'Calon Jamaah'}
                        </span>
                        <span className="db-edit-sidebar-identity__phone">
                          {initialDetail?.prospect.phone || '-'}
                        </span>
                      </div>
                    </div>

                    <div className="db-edit-sidebar-facts">
                      <div className="db-edit-sidebar-fact">
                        <Package size={13} className="db-edit-sidebar-fact__icon" />
                        <span className="db-edit-sidebar-fact__label">Paket</span>
                        <span className="db-edit-sidebar-fact__value">
                          {initialDetail?.package?.name || 'Belum pilih paket'}
                        </span>
                      </div>
                      <div className="db-edit-sidebar-fact">
                        <Users size={13} className="db-edit-sidebar-fact__icon" />
                        <span className="db-edit-sidebar-fact__label">Jumlah</span>
                        <span className="db-edit-sidebar-fact__value">
                          {initialDetail?.prospect.jumlah_jamaah || 1} jamaah
                        </span>
                      </div>
                      <div className="db-edit-sidebar-fact">
                        <Waypoints size={13} className="db-edit-sidebar-fact__icon" />
                        <span className="db-edit-sidebar-fact__label">Sumber</span>
                        <span className="db-edit-sidebar-fact__value">
                          {initialDetail?.prospect.agent_id ? 'Referral agen' : 'Website langsung'}
                        </span>
                      </div>
                      <div className="db-edit-sidebar-fact">
                        <UserRound size={13} className="db-edit-sidebar-fact__icon" />
                        <span className="db-edit-sidebar-fact__label">Agen</span>
                        <span className="db-edit-sidebar-fact__value">
                          {initialDetail?.agent?.name || '-'}
                        </span>
                      </div>
                    </div>

                    <div className="db-edit-sidebar-notice">
                      <RefreshCw size={12} className="db-edit-sidebar-notice__icon" />
                      <span className="db-edit-sidebar-notice__text">
                        Perubahan status pipeline dilakukan di halaman detail prospek.
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Sebelum menyimpan Checklist */}
                  <div className="db-edit-checklist">
                    <div className="db-edit-checklist__header">
                      <ShieldCheck size={16} className="db-edit-checklist__header-icon" />
                      <h3 className="db-edit-checklist__title">Panduan Sebelum Menyimpan</h3>
                    </div>

                    <div className="db-edit-checklist__item">
                      <CircleCheck size={15} className="db-edit-checklist__item-icon" />
                      <div className="db-edit-checklist__item-copy">
                        <span className="db-edit-checklist__item-title">Nomor WhatsApp Aktif</span>
                        <span className="db-edit-checklist__item-desc">
                          Pastikan nomor dapat dihubungi langsung.
                        </span>
                      </div>
                    </div>

                    <div className="db-edit-checklist__item">
                      <CircleCheck size={15} className="db-edit-checklist__item-icon" />
                      <div className="db-edit-checklist__item-copy">
                        <span className="db-edit-checklist__item-title">Konfirmasi Paket</span>
                        <span className="db-edit-checklist__item-desc">
                          Sesuai paket yang disepakati dengan calon jamaah.
                        </span>
                      </div>
                    </div>

                    <div className="db-edit-checklist__item">
                      <CircleCheck size={15} className="db-edit-checklist__item-icon" />
                      <div className="db-edit-checklist__item-copy">
                        <span className="db-edit-checklist__item-title">Jumlah Jamaah Valid</span>
                        <span className="db-edit-checklist__item-desc">
                          Pastikan kuota jamaah sudah sesuai.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Audit Notice */}
                  <div className="db-edit-audit-notice">
                    <History size={15} className="db-edit-audit-notice__icon" />
                    <span className="db-edit-audit-notice__text">
                      Perubahan data dicatat di riwayat aktivitas untuk audit internal.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
