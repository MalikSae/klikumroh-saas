'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Sparkles, X, Send } from 'lucide-react';
import { PackageCard } from './PackageCard';
import { FormInput } from './FormInput';
import { Button } from './Button';
import './PublicCatalog.css';

export interface PublicPackage {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  price?: number | null;
  departure_date?: string | null;
  quota?: number | null;
  status: string;
  itinerary?: string | null;
  facilities_included?: string | null;
  facilities_excluded?: string | null;
  hotel_info?: string | null;
  flight_info?: string | null;
  terms_conditions?: string | null;
  photos?: {
    id: number;
    file_path: string;
    sort_order: number;
  }[] | null;
  created_at: string;
}

export interface PublicCatalogProps {
  packages: PublicPackage[];
  tenantHost: string;
}

export const PublicCatalog: React.FC<PublicCatalogProps> = ({ packages }) => {
  const [selectedPackage, setSelectedPackage] = useState<PublicPackage | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleOpenModal = (pkg: PublicPackage) => {
    router.push(`/paket/${pkg.id}`);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^\d+]/g, '');
    if (val.indexOf('+') > 0) {
      val = val[0] + val.slice(1).replace(/\+/g, '');
    }
    setPhone(val);
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Nama lengkap wajib diisi');
      return;
    }
    if (!phone.trim()) {
      setErrorMessage('Nomor WhatsApp / telepon wajib diisi');
      return;
    }
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 9 || cleanDigits.length > 15) {
      setErrorMessage('Nomor WhatsApp tidak valid (masukkan 9-15 digit angka, contoh: 081234567890)');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() ? email.trim() : null,
        package_id: selectedPackage ? selectedPackage.id : null,
        source_channel: 'organik',
      };

      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim formulir minat');
      }

      setSuccessMessage('Alhamdulillah! Formulir minat Anda telah terkirim. Tim konsultan kami akan segera menghubungi Anda.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat mengirim formulir');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tw-catalog">
      <header className="tw-catalog__header">
        <div className="tw-catalog__badge">
          <Sparkles size={16} />
          <span>Katalog Resmi Paket Umroh</span>
        </div>
        <h1 className="tw-catalog__title">
          Pilihan Paket Perjalanan Ibadah
        </h1>
        <p className="tw-catalog__subtitle">
          Pilih paket ibadah umroh terbaik sesuai kebutuhan dan kenyamanan keluarga Anda.
        </p>
      </header>

      {packages.length === 0 ? (
        <div className="tw-catalog__empty">
          <p className="tw-catalog__empty-text">
            Saat ini belum ada paket umroh yang dipublikasikan. Silakan hubungi admin kami untuk informasi jadwal keberangkatan terbaru.
          </p>
        </div>
      ) : (
        <div className="tw-catalog__list">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              id={pkg.id}
              name={pkg.name}
              price={pkg.price || undefined}
              departureDateRaw={pkg.departure_date}
              quota={pkg.quota || undefined}
              imageUrl={pkg.photos && pkg.photos.length > 0 ? pkg.photos[0].file_path : undefined}
              onSelect={() => handleOpenModal(pkg)}
            />
          ))}
        </div>
      )}

      {/* Interest Form Modal */}
      {isModalOpen && (
        <div className="tw-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div
            className="tw-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="tw-modal-header">
              <h2 className="tw-modal-title">
                Formulir Minat Umroh
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="tw-modal-close"
                aria-label="Tutup"
              >
                <X size={20} />
              </button>
            </div>

            {successMessage ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ color: 'var(--tw-brand-primary)', marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                  <CheckCircle2 size={48} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tw-text-primary)', marginBottom: '8px', fontFamily: 'var(--tw-font-heading)' }}>
                  Terima Kasih!
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--tw-text-primary)', opacity: 0.8, lineHeight: '1.5', marginBottom: '20px' }}>
                  {successMessage}
                </p>
                <Button variant="primary" onClick={() => setIsModalOpen(false)}>
                  Tutup
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {selectedPackage && (
                  <div className="tw-modal-selected-pkg">
                    <div style={{ fontSize: '11px', color: 'var(--tw-text-primary)', opacity: 0.7 }}>Paket yang diminati:</div>
                    <div style={{ fontWeight: 700, color: 'var(--tw-text-primary)', marginTop: '2px' }}>
                      {selectedPackage.name}
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="tw-modal-error">
                    <AlertCircle size={16} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <FormInput
                  label="Nama Lengkap"
                  required
                  placeholder="Contoh: Muhammad Rofi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <FormInput
                  label="Nomor WhatsApp"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9+]*"
                  maxLength={16}
                  required
                  placeholder="Contoh: 081234567890"
                  value={phone}
                  onChange={handlePhoneChange}
                  hint="Konsultan travel akan menghubungi via WhatsApp"
                />

                <FormInput
                  label="Alamat Email (Opsional)"
                  type="email"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <div style={{ marginTop: '8px' }}>
                  <Button variant="primary" type="submit" disabled={submitting}>
                    <Send size={16} />
                    <span>{submitting ? 'Mengirim Data...' : 'Kirim Formulir Minat'}</span>
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
