'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Clock, UploadCloud, AlertCircle, Copy, Check } from 'lucide-react';
import { uploadPaymentProof, formatRupiah } from '../../../lib/api';
import { usePlatformSettings } from '../../../context/PlatformSettingsContext';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import './pembayaran.css';

export const PembayaranContent: React.FC = () => {
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');
  const amountParam = searchParams.get('amount');

  const verificationId = idParam ? parseInt(idParam, 10) : 0;
  const finalAmount = amountParam ? parseFloat(amountParam) : 0;

  const { settings } = usePlatformSettings();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const bankName = settings.bank_name || 'Bank Syariah Indonesia (BSI)';
  const bankNoRek = settings.bank_account_number || '7123456789';
  const bankAtasNama = settings.bank_account_holder || 'PT Klik Umroh Digital';

  const handleCopyNoRek = () => {
    navigator.clipboard.writeText(bankNoRek);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadError('');
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Pilih berkas bukti transfer terlebih dahulu');
      return;
    }
    if (!verificationId) {
      setUploadError('ID verifikasi pembayaran tidak ditemukan');
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      await uploadPaymentProof(verificationId, selectedFile);
      setUploadSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah bukti';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  // KASUS 1: Kupon 100% (final_amount == 0)
  if (finalAmount === 0) {
    return (
      <div className="mkt-container mkt-pembayaran-container">
        <Card className="mkt-pembayaran-card mkt-pembayaran-card--success">
          <div className="mkt-pembayaran-icon-wrapper">
            <CheckCircle2 className="mkt-pembayaran-icon mkt-pembayaran-icon--success" />
          </div>
          <h1 className="mkt-headline" style={{ fontSize: '26px', marginBottom: '12px' }}>
            Pendaftaran Diterima
          </h1>
          <p className="mkt-pembayaran-message">
            Pendaftaran diterima, menunggu review admin
          </p>
          <p className="mkt-pembayaran-subtext">
            Kupon 100% berhasil diterapkan. Akun travel Anda saat ini sedang dalam proses review oleh tim KlikUmroh sebelum diaktifkan.
          </p>
          <div style={{ marginTop: '28px' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Button variant="primary">Kembali ke Beranda</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // KASUS 2: Setelah Bukti Pembayaran Berhasil Terupload
  if (uploadSuccess) {
    return (
      <div className="mkt-container mkt-pembayaran-container">
        <Card className="mkt-pembayaran-card mkt-pembayaran-card--waiting">
          <div className="mkt-pembayaran-icon-wrapper">
            <Clock className="mkt-pembayaran-icon mkt-pembayaran-icon--waiting" />
          </div>
          <h1 className="mkt-headline" style={{ fontSize: '26px', marginBottom: '12px' }}>
            Bukti Pembayaran Diterima
          </h1>
          <p className="mkt-pembayaran-message">
            Menunggu verifikasi pembayaran oleh tim KlikUmroh
          </p>
          <p className="mkt-pembayaran-subtext">
            Tim kami akan memverifikasi pembayaran Anda maksimal 1x24 jam kerja. Setelah pembayaran disetujui, akun travel Anda akan langsung aktif.
          </p>
          <div style={{ marginTop: '28px' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Button variant="primary">Kembali ke Beranda</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // KASUS 3: Nominal > 0 (Tampilkan Rekening Transfer + Form Upload Bukti)
  return (
    <div className="mkt-container mkt-pembayaran-container">
      <div className="mkt-pembayaran-header">
        <h1 className="mkt-headline">Selesaikan Pembayaran</h1>
        <p className="mkt-subheadline">
          Silakan transfer sesuai nominal ke rekening resmi KlikUmroh, lalu unggah bukti transfer di bawah ini.
        </p>
      </div>

      <div className="mkt-pembayaran-box">
        {/* Card Instruksi Rekening */}
        <Card className="mkt-rekening-card">
          <div className="mkt-rekening-amount-row">
            <div>
              <span className="mkt-rekening-amount-label">Total yang Harus Ditransfer</span>
              <div className="mkt-rekening-amount-value">{formatRupiah(finalAmount)}</div>
            </div>
          </div>

          <div className="mkt-rekening-details">
            <div className="mkt-rekening-row">
              <span className="mkt-rekening-label">Bank Tujuan</span>
              <span className="mkt-rekening-val">{bankName}</span>
            </div>

            <div className="mkt-rekening-row">
              <span className="mkt-rekening-label">Nomor Rekening</span>
              <div className="mkt-rekening-val-copy">
                <span>{bankNoRek}</span>
                <button
                  type="button"
                  onClick={handleCopyNoRek}
                  className="mkt-copy-btn"
                  title="Salin nomor rekening"
                >
                  {copied ? <Check className="mkt-copy-icon" /> : <Copy className="mkt-copy-icon" />}
                  <span>{copied ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            <div className="mkt-rekening-row">
              <span className="mkt-rekening-label">Atas Nama</span>
              <span className="mkt-rekening-val">{bankAtasNama}</span>
            </div>
          </div>

          <p className="mkt-rekening-note">
            Catatan: Nomor rekening di atas merupakan rekening resmi verifikasi otomatis platform KlikUmroh.
          </p>
        </Card>

        {/* Card Form Upload Bukti */}
        <Card className="mkt-upload-card">
          <h3 className="mkt-upload-card__title">Unggah Bukti Transfer</h3>

          {uploadError && (
            <div className="mkt-form-alert mkt-form-alert--error">
              <AlertCircle className="mkt-form-alert__icon" />
              <span>{uploadError}</span>
            </div>
          )}

          <form onSubmit={handleUploadSubmit}>
            <div className="mkt-file-dropzone">
              <input
                type="file"
                id="proof_file_input"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="mkt-file-input-hidden"
              />
              <label htmlFor="proof_file_input" className="mkt-file-label">
                <UploadCloud className="mkt-dropzone-icon" />
                {selectedFile ? (
                  <div>
                    <strong className="mkt-file-selected-name">{selectedFile.name}</strong>
                    <p className="mkt-file-selected-size">
                      ({Math.round(selectedFile.size / 1024)} KB) - Klik untuk mengganti berkas
                    </p>
                  </div>
                ) : (
                  <div>
                    <strong>Pilih foto atau tangkapan layar bukti transfer</strong>
                    <p>Format JPG, PNG, atau WebP (Maksimal 10MB)</p>
                  </div>
                )}
              </label>
            </div>

            <div style={{ marginTop: '24px' }}>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={uploading || !selectedFile}
              >
                {uploading ? 'Mengunggah Bukti Pembayaran...' : 'Kirim Bukti Pembayaran'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};
