'use client';

import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { FormInput } from './FormInput';
import { Button } from './Button';
import './ProspectModal.css';

const WhatsAppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.05 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

export interface ProspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPackage?: { id: number; name: string } | null;
  waNumber?: string;
}

export const ProspectModal: React.FC<ProspectModalProps> = ({
  isOpen,
  onClose,
  selectedPackage,
  waNumber = '6281234567890',
}) => {
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [jamaahCount, setJamaahCount] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waRedirectUrl, setWaRedirectUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setWaRedirectUrl(null);
    setName('');
    setPhone('');
    setJamaahCount('');
    onClose();
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^\d+]/g, '');
    if (val.indexOf('+') > 0) {
      val = val[0] + val.slice(1).replace(/\+/g, '');
    }
    setPhone(val);
    if (errorMessage) setErrorMessage(null);
  };

  const getReferralCode = (): string | null => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const refFromUrl = params.get('ref');
    if (refFromUrl) return refFromUrl;

    const match = document.cookie.match(/(?:^|;\s*)ref_code=([^;]+)/);
    if (match && match[1]) return decodeURIComponent(match[1]);

    return null;
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

      const countVal = jamaahCount.trim() ? parseInt(jamaahCount.trim(), 10) : null;
      const refCode = getReferralCode();

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: null,
        package_id: selectedPackage ? selectedPackage.id : null,
        referral_code: refCode,
        source_channel: refCode ? 'agen' : 'organik',
        jumlah_jamaah: countVal && countVal > 0 ? countVal : null,
      };

      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim data');
      }

      // Sesuai instruksi: cek response.whatsapp_redirect_url
      // Kalau ada isinya, langsung window.location.href ke situ (redirect WhatsApp).
      // Kalau null, tampilkan pesan sukses sederhana di dalam modal tanpa redirect apa pun.
      if (data.whatsapp_redirect_url) {
        setWaRedirectUrl(data.whatsapp_redirect_url);
        if (typeof window !== 'undefined') {
          window.location.href = data.whatsapp_redirect_url;
        }
      } else {
        setSuccessMessage('Terima kasih, tim kami akan segera menghubungi Anda');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat memproses data');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tw-modal-overlay" onClick={handleClose}>
      <div
        className="tw-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="tw-modal-header">
          <h2 className="tw-modal-title">Konsultasi gratis, tanpa biaya komitmen.</h2>
          <button
            type="button"
            onClick={handleClose}
            className="tw-modal-close"
            aria-label="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {successMessage ? (
          <div className="tw-modal-success">
            <div className="tw-modal-success__icon">
              <CheckCircle2 size={48} />
            </div>
            <h3 className="tw-modal-success__title">Terima Kasih!</h3>
            <p className="tw-modal-success__desc">{successMessage}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '12px' }}>
              {waRedirectUrl && (
                <Button
                  variant="primary"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.open(waRedirectUrl, '_blank');
                    }
                  }}
                >
                  <WhatsAppIcon size={18} />
                  <span>Buka WhatsApp</span>
                </Button>
              )}
              <Button variant="secondary" onClick={handleClose}>
                Tutup
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {selectedPackage && (
              <div className="tw-modal-selected-pkg">
                <div className="tw-modal-selected-pkg__label">Paket yang diminati:</div>
                <div className="tw-modal-selected-pkg__name">{selectedPackage.name}</div>
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
            />

            <FormInput
              label="Rencana Jumlah Jamaah"
              type="number"
              placeholder="Contoh: 2"
              value={jamaahCount}
              onChange={(e) => setJamaahCount(e.target.value)}
            />

            <div style={{ marginTop: '8px' }}>
              <Button variant="primary" type="submit" disabled={submitting}>
                <WhatsAppIcon size={18} />
                <span>{submitting ? 'Menghubungkan...' : 'Konsultasi Sekarang'}</span>
              </Button>
              <div className="tw-modal-footer-note">
                Anda akan terhubung ke no whatsapp konsultan travel
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
