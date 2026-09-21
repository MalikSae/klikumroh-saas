import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, CheckCircle2, AlertCircle, Building2, Phone } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import {
  fetchPlatformSettingsStaff,
  updatePlatformSettingsStaff,
  type PlatformSettingsInput,
} from '../../../services/staffApi';

export const AdminSettingsView: React.FC = () => {
  const [formData, setFormData] = useState<PlatformSettingsInput>({
    whatsapp_number: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_holder: '',
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      });
    } catch (err: any) {
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
      await updatePlatformSettingsStaff(formData);
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
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: 'var(--sa-radius-sm)',
            color: '#059669',
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
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 'var(--sa-radius-sm)',
            color: '#DC2626',
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

      <form onSubmit={handleSubmit} style={{ maxWidth: '720px' }}>
        {/* Panel Rekening Bank */}
        <div className="sa-panel" style={{ padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Building2 size={18} style={{ color: 'var(--sa-text-muted)' }} />
            <h2 style={{ fontFamily: 'var(--sa-font-heading)', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Rekening Bank Pembayaran Manual
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--sa-text-muted)', margin: '0 0 20px 0' }}>
            Rekening ini ditampilkan kepada travel mitra saat melakukan checkout langganan.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
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
                  fontSize: '13px',
                  border: '1px solid var(--sa-border)',
                  borderRadius: 'var(--sa-radius-sm)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
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
                    fontSize: '13px',
                    fontFamily: 'var(--sa-font-mono)',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
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
                    fontSize: '13px',
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
            <h2 style={{ fontFamily: 'var(--sa-font-heading)', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Dukungan & Helpdesk Resmi
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--sa-text-muted)', margin: '0 0 20px 0' }}>
            Nomor WhatsApp pusat untuk konfirmasi pembayaran dan bantuan teknis travel.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
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
                fontSize: '13px',
                border: '1px solid var(--sa-border)',
                borderRadius: 'var(--sa-radius-sm)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
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
    </AdminLayout>
  );
};
