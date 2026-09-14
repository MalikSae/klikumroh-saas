import React, { useState, useEffect } from 'react';
import { Card, FormInput, Button } from '../components';
import {
  fetchPlatformSettingsStaff,
  updatePlatformSettingsStaff,
  type PlatformSettings,
} from '../services/staffApi';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Phone,
  CreditCard,
  Building2,
  User,
  ShieldCheck,
} from 'lucide-react';

export const StaffSettingsPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<PlatformSettings>({
    whatsapp_number: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_holder: '',
  });

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPlatformSettingsStaff();
      setFormData(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat pengaturan platform');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.whatsapp_number.trim()) {
      setError('Nomor WhatsApp resmi platform wajib diisi');
      return;
    }
    if (!formData.bank_name.trim()) {
      setError('Nama bank wajib diisi');
      return;
    }
    if (!formData.bank_account_number.trim()) {
      setError('Nomor rekening bank wajib diisi');
      return;
    }
    if (!formData.bank_account_holder.trim()) {
      setError('Nama pemilik rekening (atas nama) wajib diisi');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await updatePlatformSettingsStaff(formData);
      setFormData(updated);
      setSuccessMsg('Pengaturan platform berhasil disimpan.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan platform');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--db-text-muted)' }}>
        Memuat pengaturan platform...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: '840px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--db-text-primary)',
            margin: '0 0 6px 0',
          }}
        >
          Pengaturan Platform
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--db-text-muted)', margin: 0 }}>
          Konfigurasi nomor WhatsApp resmi KlikUmroh dan data rekening bank transfer untuk pembayaran langganan travel.
        </p>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--db-positive-subtle)',
            border: '1px solid var(--db-positive-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--db-positive)',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--db-negative-subtle)',
            border: '1px solid var(--db-negative-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--db-negative)',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section 1: Kontak WhatsApp Resmi */}
          <Card
            title="Kontak Resmi Platform (WhatsApp)"
            subtitle="Nomor WhatsApp ini digunakan sebagai tautan resmi untuk demo, konsultasi calon travel, dan bantuan pelanggan di situs marketing KlikUmroh.id"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Phone size={18} style={{ color: 'var(--db-primary)' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                  Nomor WhatsApp Call-to-Action
                </span>
              </div>

              <FormInput
                label="Nomor WhatsApp (Format: 628xxxxxxxxxx)"
                name="whatsapp_number"
                placeholder="Contoh: 6281234567890"
                value={formData.whatsapp_number}
                onChange={(e) =>
                  setFormData({ ...formData, whatsapp_number: e.target.value })
                }
              />

              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--db-text-muted)',
                  lineHeight: 1.5,
                  padding: '10px 14px',
                  backgroundColor: 'var(--db-surface-hover)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                }}
              >
                Gunakan awalan kode negara tanpa tanda plus atau spasi (contoh: <code>6281234567890</code>). Tautan otomatis akan diarahkan ke format <code>https://wa.me/628...</code> pada tombol demo dan footer situs marketing.
              </div>
            </div>
          </Card>

          {/* Section 2: Data Rekening Bank */}
          <Card
            title="Data Rekening Bank Pembayaran"
            subtitle="Rekening resmi tujuan transfer untuk aktivasi paket pendaftaran baru dan perpanjangan langganan travel"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <CreditCard size={18} style={{ color: 'var(--db-primary)' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                  Detail Rekening Transfer
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Building2 size={15} style={{ color: 'var(--db-text-muted)' }} />
                    <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--db-text-primary)' }}>
                      Nama Bank *
                    </label>
                  </div>
                  <FormInput
                    label=""
                    name="bank_name"
                    placeholder="Contoh: Bank Syariah Indonesia (BSI)"
                    value={formData.bank_name}
                    onChange={(e) =>
                      setFormData({ ...formData, bank_name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <CreditCard size={15} style={{ color: 'var(--db-text-muted)' }} />
                    <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--db-text-primary)' }}>
                      Nomor Rekening *
                    </label>
                  </div>
                  <FormInput
                    label=""
                    name="bank_account_number"
                    placeholder="Contoh: 7123456789"
                    value={formData.bank_account_number}
                    onChange={(e) =>
                      setFormData({ ...formData, bank_account_number: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <User size={15} style={{ color: 'var(--db-text-muted)' }} />
                  <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--db-text-primary)' }}>
                    Atas Nama Pemilik Rekening *
                  </label>
                </div>
                <FormInput
                  label=""
                  name="bank_account_holder"
                  placeholder="Contoh: PT Klik Umroh Digital"
                  value={formData.bank_account_holder}
                  onChange={(e) =>
                    setFormData({ ...formData, bank_account_holder: e.target.value })
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--db-text-muted)',
                  padding: '10px 14px',
                  backgroundColor: 'var(--db-surface-hover)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                }}
              >
                <ShieldCheck size={16} style={{ color: 'var(--db-primary)', flexShrink: 0 }} />
                <span>
                  Informasi rekening ini akan langsung tampil secara otomatis pada halaman pembayaran registrasi travel baru dan tab Langganan & Tagihan.
                </span>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px' }}
            >
              <Save size={16} />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
