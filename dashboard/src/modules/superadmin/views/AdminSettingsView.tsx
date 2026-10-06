import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle, Building2, Phone, FileText } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import {
  fetchPlatformSettingsStaff,
  updatePlatformSettingsStaff,
  type PlatformSettingsInput,
} from '../../../services/staffApi';

// Human labels for missing_fields returned by the API.
const FIELD_LABELS: Record<string, string> = {
  whatsapp_number: 'Nomor WhatsApp CS',
  bank_name: 'Nama bank',
  bank_account_number: 'Nomor rekening',
  bank_account_holder: 'Atas nama rekening',
  terms_url: 'URL Syarat & Ketentuan',
  privacy_url: 'URL Kebijakan Privasi',
};

export const AdminSettingsView: React.FC = () => {
  const [formData, setFormData] = useState<PlatformSettingsInput>({
    whatsapp_number: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_holder: '',
    terms_url: '',
    privacy_url: '',
  });
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // The save is a full replace: never offer the (empty) form when the load failed, or saving after filling
  // in the bank fields would wipe the terms and privacy URLs.
  const [loaded, setLoaded] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPlatformSettingsStaff();
      setFormData({
        whatsapp_number: data.whatsapp_number || '',
        bank_name: data.bank_name || '',
        bank_account_number: data.bank_account_number || '',
        bank_account_holder: data.bank_account_holder || '',
        terms_url: data.terms_url || '',
        privacy_url: data.privacy_url || '',
      });
      setMissingFields(data.missing_fields || []);
      setLoaded(true);
    } catch (err: any) {
      setLoaded(false);
      setSuccessMessage(null);
      setError(err.message || 'Gagal memuat pengaturan platform');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      const updated = await updatePlatformSettingsStaff(formData);
      // Show what the server stored (it normalizes the WhatsApp number, e.g. 0812... -> 62812...).
      setFormData((prev) => ({
        whatsapp_number: updated.whatsapp_number ?? prev.whatsapp_number,
        bank_name: updated.bank_name ?? prev.bank_name,
        bank_account_number: updated.bank_account_number ?? prev.bank_account_number,
        bank_account_holder: updated.bank_account_holder ?? prev.bank_account_holder,
        terms_url: updated.terms_url ?? prev.terms_url,
        privacy_url: updated.privacy_url ?? prev.privacy_url,
      }));
      setMissingFields(updated.missing_fields || []);
      setSuccessMessage('Pengaturan platform berhasil diperbarui');
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title="Pengaturan"
      subtitle="Konfigurasi rekening bank pembayaran manual dan kontak dukungan platform"
      headerActions={
        <button
          type="button"
          className="sa-btn sa-btn--secondary"
          onClick={loadData}
          disabled={loading || saving}
        >
          <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
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

      {!loading && !loaded && (
        <button type="button" className="sa-btn sa-btn--secondary" onClick={loadData}>
          <RefreshCw size={14} />
          <span>Coba lagi</span>
        </button>
      )}

      {!loading && loaded && missingFields.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-amber-bg)',
            border: '1px solid var(--sa-amber-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-amber-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '20px',
            maxWidth: '720px',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            Pengaturan belum lengkap: {missingFields.map((f) => FIELD_LABELS[f] || f).join(', ')}. Selama rekening
            kosong, halaman pembayaran tidak menampilkan rekening; selama URL S&K/Privasi kosong, pendaftaran travel
            baru ditutup.
          </span>
        </div>
      )}

      {loaded && (
      <form onSubmit={handleSubmit} style={{ maxWidth: '720px' }}>
        {/* Panel Rekening Bank */}
        <div className="sa-panel" style={{ padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Building2 size={18} style={{ color: 'var(--sa-text-muted)' }} />
            <h2 style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Rekening Bank Pembayaran Manual
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--sa-text-muted)', margin: '0 0 20px 0' }}>
            Rekening ini ditampilkan kepada travel mitra saat melakukan checkout langganan.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Nama Bank:
              </label>
              <input
                type="text"
                placeholder="Contoh: Bank Central Asia (BCA)"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Nomor Rekening:
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 1234567890"
                  value={formData.bank_account_number}
                  onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: 'var(--db-text-input)',
                    fontFamily: 'var(--sa-font-code)',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Atas Nama (Pemilik Rekening):
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT Klik Umroh Indonesia"
                  value={formData.bank_account_holder}
                  onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
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
            </div>
          </div>
        </div>

        {/* Panel Kontak Bantuan */}
        <div className="sa-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Phone size={18} style={{ color: 'var(--sa-text-muted)' }} />
            <h2 style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Dukungan & Helpdesk Resmi
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--sa-text-muted)', margin: '0 0 20px 0' }}>
            Nomor WhatsApp pusat untuk konfirmasi pembayaran dan bantuan teknis travel.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Nomor WhatsApp CS:
            </label>
            <input
              type="text"
              placeholder="Contoh: 081234567890"
              value={formData.whatsapp_number}
              onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
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
        </div>

        {/* Panel Dokumen Legal */}
        <div className="sa-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={18} style={{ color: 'var(--sa-text-muted)' }} />
            <h2 style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Dokumen Legal
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--sa-text-muted)', margin: '0 0 20px 0' }}>
            Ditautkan di checkout dan footer. Pendaftaran travel baru ditutup sampai kedua URL diisi (wajib https://).
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {([
              ['terms_url', 'URL Syarat & Ketentuan:', 'https://klikumroh.id/syarat-ketentuan'],
              ['privacy_url', 'URL Kebijakan Privasi:', 'https://klikumroh.id/kebijakan-privasi'],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  {label}
                </label>
                <input
                  type="url"
                  placeholder={placeholder}
                  value={formData[key]}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
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
            ))}
          </div>
        </div>

        {/* Submit Action */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="sa-btn sa-btn--primary"
            disabled={saving || loading}
          >
            <Save size={14} />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
          </button>
        </div>
      </form>
      )}
    </AdminLayout>
  );
};
