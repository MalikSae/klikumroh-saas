'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Check,
  Clock3,
  Copy,
  House,
  MessageCircle,
  Headphones,
  ArrowUpRight,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import styles from './PaymentInstructionView.module.css';

export interface PlatformSettings {
  whatsapp_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export interface PaymentInstructionProps {
  orderNumber?: string;
  travelName?: string;
  slug?: string;
  planName?: string;
  baseAmount?: number;
  discountAmount?: number;
  uniqueCode?: number;
  finalAmount?: number;
  verificationId?: number;
  adminEmail?: string;
  adminWhatsApp?: string;
}

function formatWaUrl(phone: string, text: string): string {
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1);
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

export const PaymentInstructionView: React.FC<PaymentInstructionProps> = ({
  orderNumber = 'KU-260923-0182',
  travelName = 'Al-Barakah Tour & Travel',
  slug = 'albarakah.klikumroh.id',
  planName = '6 Bulan',
  baseAmount,
  discountAmount,
  uniqueCode,
  finalAmount = 2700000,
  verificationId,
  adminEmail,
  adminWhatsApp,
}) => {
  const [settings, setSettings] = useState<PlatformSettings>({
    whatsapp_number: '6281234567890',
    bank_name: 'Bank Syariah Indonesia (BSI)',
    bank_account_number: '7123456789',
    bank_account_holder: 'PT Klik Umroh Digital',
  });

  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofUploaded, setProofUploaded] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofFile || !verificationId) return;

    try {
      setIsUploadingProof(true);
      setProofError(null);
      const fd = new FormData();
      fd.append('proof_file', proofFile);

      const res = await fetch(`/api/public/tenant-signup/${verificationId}/proof`, {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Gagal mengunggah bukti transfer' }));
        throw new Error(errJson.error || 'Gagal mengunggah bukti transfer');
      }

      setProofUploaded(true);
    } catch (err: any) {
      setProofError(err.message || 'Gagal mengunggah bukti transfer');
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Fetch dynamic platform settings from superadmin
  useEffect(() => {
    fetch('/api/public/platform-settings')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch platform settings');
        return res.json();
      })
      .then((data) => {
        if (data && (data.bank_name || data.whatsapp_number)) {
          setSettings({
            whatsapp_number: data.whatsapp_number || '6281234567890',
            bank_name: data.bank_name || 'Bank Syariah Indonesia (BSI)',
            bank_account_number: data.bank_account_number || '7123456789',
            bank_account_holder: data.bank_account_holder || 'PT Klik Umroh Digital',
          });
        }
      })
      .catch(() => {});
  }, []);

  // Normalize slug display
  const displaySlug = slug.includes('.klikumroh.id') ? slug : `${slug}.klikumroh.id`;

  // Normalize and round amount to eliminate any floating-point imprecision
  const roundedAmount = Math.round(Number(finalAmount) || 0);

  // Format amount
  const formattedAmount = `Rp${roundedAmount.toLocaleString('id-ID')}`;

  // Copy Handlers
  const handleCopyAccount = () => {
    const rawAcc = settings.bank_account_number.replace(/\s+/g, '');
    navigator.clipboard.writeText(rawAcc);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(roundedAmount.toString());
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // WhatsApp URLs with dynamic settings
  const waConfirmMessage = `Halo Tim KlikUmroh, saya sudah melakukan pembayaran langganan:

- Nomor Pesanan: ${orderNumber}
- Nama Travel: ${travelName}
- Subdomain: ${displaySlug}
- Paket: ${planName}
- Total: ${formattedAmount}

Mohon dicek dan diaktifkan akun travel kami. Terima kasih.`;

  const waConfirmPaymentUrl = formatWaUrl(settings.whatsapp_number, waConfirmMessage);

  const waSupportUrl = formatWaUrl(
    settings.whatsapp_number,
    `Halo Tim KlikUmroh, saya butuh bantuan untuk pesanan nomor ${orderNumber} (${travelName}).`
  );

  const waCorrectionUrl = formatWaUrl(
    settings.whatsapp_number,
    `Halo Tim KlikUmroh, ada data yang keliru pada pesanan ${orderNumber} (${travelName}): `
  );

  return (
    <div className={styles.page}>
      {/* ── Payment Page Navigation (Height: 84px) ── */}
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          <Link href="/marketing" className={styles.navBrand} aria-label="KlikUmroh Beranda">
            <Image
              src="/klikumroh-logo.png"
              alt="KlikUmroh.id"
              width={190}
              height={55}
              className={styles.logoImage}
              priority
            />
          </Link>
          <div className={styles.navStatus}>
            <span className={styles.statusDot} />
            <span className={styles.statusText}>Menunggu pembayaran</span>
          </div>
        </div>
      </header>

      {/* ── Thank You Main Content ── */}
      <main className={styles.main}>
        <div className={styles.mainInner}>
          {/* Payment Success Header */}
          <div className={styles.successHeader}>
            <div className={styles.iconContainer}>
              <Check size={27} className={styles.checkIcon} strokeWidth={2.6} />
            </div>

            <div className={styles.headerCopy}>
              <span className={styles.eyebrow}>PENDAFTARAN BERHASIL DIKIRIM</span>
              <h1 className={styles.title}>
                Selesaikan pembayaran untuk mengaktifkan akun travel
              </h1>
              <p className={styles.description}>
                Instruksi pembayaran juga telah dikirim ke email
                {adminEmail ? ` (${adminEmail})` : ''} dan WhatsApp PIC
                {adminWhatsApp ? ` (${adminWhatsApp})` : ''}.
              </p>
            </div>

            <div className={styles.orderNumberBox}>
              <span className={styles.orderNumberLabel}>NOMOR PESANAN</span>
              <span className={styles.orderNumberValue}>{orderNumber}</span>
            </div>
          </div>

          {/* Payment Content Layout */}
          <div className={styles.contentLayout}>
            {/* ── Left: Payment Instruction Column (740px) ── */}
            <div className={styles.instructionColumn}>
              {/* Payment Deadline Alert */}
              <div className={styles.deadlineAlert}>
                <Clock3 size={18} className={styles.deadlineIcon} />
                <div className={styles.deadlineCopy}>
                  <span className={styles.deadlineTitle}>
                    Selesaikan pembayaran dalam 24 jam
                  </span>
                  <span className={styles.deadlineDescription}>
                    Pesanan otomatis dibatalkan jika melewati batas waktu.
                  </span>
                </div>
              </div>

              {/* Bank Transfer Payment Card */}
              <div className={styles.paymentCard}>
                {/* Method Header */}
                <div className={styles.paymentMethodHeader}>
                  <div className={styles.paymentMethodCopy}>
                    <span className={styles.paymentMethodLabel}>METODE PEMBAYARAN</span>
                    <h2 className={styles.paymentMethodName}>Transfer Bank</h2>
                  </div>
                </div>

                <div className={styles.divider} />

                {/* Bank Name Row */}
                <div className={styles.paymentRowGroup}>
                  <span className={styles.paymentRowLabel}>Bank tujuan</span>
                  <div className={styles.paymentRowContent}>
                    <span className={styles.bankValue}>{settings.bank_name}</span>
                  </div>
                </div>

                {/* Account Number Row */}
                <div className={styles.paymentRowGroup}>
                  <span className={styles.paymentRowLabel}>Nomor rekening</span>
                  <div className={styles.paymentRowContent}>
                    <span className={styles.accountNumberValue}>{settings.bank_account_number}</span>
                    <button
                      type="button"
                      className={styles.copyButton}
                      onClick={handleCopyAccount}
                      aria-label="Salin nomor rekening"
                    >
                      {copiedAccount ? (
                        <>
                          <Check size={14} className={styles.copyIcon} />
                          <span className={styles.copyText}>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} className={styles.copyIcon} />
                          <span className={styles.copyText}>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Account Holder Row */}
                <div className={styles.paymentRowGroup}>
                  <span className={styles.paymentRowLabel}>Atas nama rekening</span>
                  <div className={styles.paymentRowContent}>
                    <span className={styles.holderValue}>{settings.bank_account_holder}</span>
                  </div>
                </div>

                {/* Amount Row */}
                {uniqueCode !== undefined && uniqueCode > 0 ? (
                  <div className={styles.paymentBreakdownGroup}>
                    {baseAmount !== undefined && (
                      <div className={styles.breakdownRow}>
                        <span className={styles.breakdownLabel}>Harga Paket ({planName})</span>
                        <span className={styles.breakdownValue}>Rp{baseAmount.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {discountAmount !== undefined && discountAmount > 0 && (
                      <div className={styles.breakdownRow}>
                        <span className={styles.breakdownLabel}>Diskon Kupon</span>
                        <span className={styles.breakdownDiscount}>-Rp{discountAmount.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    <div className={styles.breakdownRow}>
                      <span className={styles.breakdownLabel}>Kode Unik Transfer</span>
                      <span className={styles.breakdownUniqueCode}>+Rp{uniqueCode}</span>
                    </div>
                    <div className={styles.breakdownRow} style={{ paddingTop: 8, borderTop: '1px solid var(--km-line)' }}>
                      <span className={styles.paymentRowLabel}>Total harus ditransfer</span>
                      <div className={styles.paymentRowContent}>
                        <span className={styles.amountValue}>{formattedAmount}</span>
                        <button
                          type="button"
                          className={styles.copyButton}
                          onClick={handleCopyAmount}
                          aria-label="Salin jumlah pembayaran"
                        >
                          {copiedAmount ? (
                            <>
                              <Check size={14} className={styles.copyIcon} />
                              <span className={styles.copyText}>Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} className={styles.copyIcon} />
                              <span className={styles.copyText}>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <p className={styles.uniqueCodeNotice}>
                      *PENTING: Mohon transfer tepat hingga 3 digit terakhir <strong>(Rp{uniqueCode})</strong> agar pembayaran Anda dapat diverifikasi secara instan.
                    </p>
                  </div>
                ) : (
                  <div className={styles.paymentRowGroup}>
                    <span className={styles.paymentRowLabel}>Jumlah yang harus dibayar</span>
                    <div className={styles.paymentRowContent}>
                      <span className={styles.amountValue}>{formattedAmount}</span>
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={handleCopyAmount}
                        aria-label="Salin jumlah pembayaran"
                      >
                        {copiedAmount ? (
                          <>
                            <Check size={14} className={styles.copyIcon} />
                            <span className={styles.copyText}>Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} className={styles.copyIcon} />
                            <span className={styles.copyText}>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className={styles.divider} />

                {/* Payment Steps */}
                <div className={styles.paymentSteps}>
                  <h3 className={styles.stepsHeading}>Cara membayar</h3>

                  <div className={styles.stepItem}>
                    <div className={styles.stepNumber}>
                      <span className={styles.stepNumberText}>1</span>
                    </div>
                    <p className={styles.stepText}>
                      Buka aplikasi m-Banking, internet banking, atau ATM bank Anda.
                    </p>
                  </div>

                  <div className={styles.stepItem}>
                    <div className={styles.stepNumber}>
                      <span className={styles.stepNumberText}>2</span>
                    </div>
                    <p className={styles.stepText}>
                      Pilih menu Transfer Antar Bank atau Transfer ke Rekening Bank.
                    </p>
                  </div>

                  <div className={styles.stepItem}>
                    <div className={styles.stepNumber}>
                      <span className={styles.stepNumberText}>3</span>
                    </div>
                    <p className={styles.stepText}>
                      Pilih bank tujuan <strong>{settings.bank_name}</strong> dan masukkan nomor rekening <strong>{settings.bank_account_number}</strong>.
                    </p>
                  </div>

                  <div className={styles.stepItem}>
                    <div className={styles.stepNumber}>
                      <span className={styles.stepNumberText}>4</span>
                    </div>
                    <p className={styles.stepText}>
                      Pastikan penerima adalah <strong>{settings.bank_account_holder}</strong> dan masukkan nominal tepat <strong>{formattedAmount}</strong>{uniqueCode ? ' (termasuk kode unik transfer)' : ''}.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bukti Berhasil Diunggah Notice */}
              {proofUploaded && (
                <div className={styles.proofSuccessNotice}>
                  <CheckCircle2 size={20} className={styles.successModalIcon} />
                  <div>
                    <strong>Bukti transfer berhasil dikirim!</strong>
                    <div>Tim KlikUmroh sedang memverifikasi pembayaran Anda. Akun travel Anda akan segera diaktifkan.</div>
                  </div>
                </div>
              )}

              {/* Payment Actions */}
              <div className={styles.actionsRow}>
                {verificationId && (
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(true)}
                    className={styles.btnUploadProof}
                  >
                    <Upload size={16} />
                    <span>{proofUploaded ? 'Unggah Ulang Bukti' : 'Unggah Bukti Transfer'}</span>
                  </button>
                )}

                <a
                  href={waConfirmPaymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="btn-paid-status"
                  className={styles.btnPaid}
                >
                  <MessageCircle size={16} />
                  <span>Konfirmasi via WhatsApp</span>
                </a>

                <Link href="/marketing" className={styles.btnHome}>
                  <House size={15} />
                  <span>Kembali ke beranda</span>
                </Link>
              </div>
            </div>

            {/* ── Right: Payment Detail Column (fill_container) ── */}
            <div className={styles.detailColumn}>
              {/* Order Detail Card */}
              <div className={styles.orderDetailCard}>
                <h3 className={styles.orderDetailHeading}>Detail pesanan</h3>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Nama travel</span>
                  <span className={styles.detailValue}>{travelName}</span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Subdomain</span>
                  <span className={styles.detailValue}>{displaySlug}</span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Paket</span>
                  <span className={styles.detailValue}>{planName}</span>
                </div>

                {baseAmount !== undefined && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Harga Paket</span>
                    <span className={styles.detailValue}>Rp{baseAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}

                {discountAmount !== undefined && discountAmount > 0 && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Diskon Kupon</span>
                    <span className={styles.detailValue} style={{ color: 'var(--km-green)' }}>
                      -Rp{discountAmount.toLocaleString('id-ID')}
                    </span>
                  </div>
                )}

                {uniqueCode !== undefined && uniqueCode > 0 && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Kode Unik Transfer</span>
                    <span className={styles.detailValue} style={{ color: 'var(--km-orange)' }}>
                      +Rp{uniqueCode}
                    </span>
                  </div>
                )}

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Total</span>
                  <span className={styles.detailValue}>{formattedAmount}</span>
                </div>

                <div className={styles.divider} />

                <a
                  href={waCorrectionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.supportLink}
                >
                  <MessageCircle size={15} className={styles.supportIcon} />
                  <span>Ada data yang keliru? Hubungi tim kami</span>
                </a>
              </div>

              {/* Payment Help Card */}
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.helpCard}
              >
                <div className={styles.helpIconContainer}>
                  <Headphones size={18} className={styles.helpIcon} />
                </div>
                <div className={styles.helpCopy}>
                  <span className={styles.helpTitle}>Butuh bantuan pembayaran?</span>
                  <span className={styles.helpDescription}>
                    Tim KlikUmroh siap membantu lewat WhatsApp.
                  </span>
                </div>
                <ArrowUpRight size={16} className={styles.helpArrow} />
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Modal Upload Bukti Transfer */}
      {isUploadModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsUploadModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Unggah Bukti Transfer</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsUploadModalOpen(false)}
                aria-label="Tutup modal"
              >
                <X size={18} />
              </button>
            </div>

            {proofUploaded ? (
              <div className={styles.uploadSuccessBox}>
                <CheckCircle2 size={40} className={styles.successModalIcon} />
                <h4 className={styles.uploadSuccessTitle}>Bukti Berhasil Diunggah!</h4>
                <p className={styles.uploadSuccessText}>
                  Bukti pembayaran untuk pesanan <strong>{orderNumber}</strong> ({travelName}) telah diterima.
                  Tim KlikUmroh akan memproses verifikasi dan mengaktifkan akun travel Anda.
                </p>
                <button
                  type="button"
                  className={styles.modalSubmitBtn}
                  onClick={() => setIsUploadModalOpen(false)}
                >
                  Selesai
                </button>
              </div>
            ) : (
              <form onSubmit={handleUploadProof} className={styles.modalBody}>
                <p className={styles.modalDesc}>
                  Silakan unggah foto atau screenshot bukti transfer Anda untuk pesanan <strong>{orderNumber}</strong> sebesar <strong>{formattedAmount}</strong>.
                </p>

                {proofError && (
                  <div className={styles.uploadErrorBox}>
                    {proofError}
                  </div>
                )}

                <div className={styles.fileUploadArea}>
                  <label className={styles.fileUploadLabel}>
                    <Upload size={24} className={styles.uploadIcon} />
                    <span className={styles.fileUploadPrompt}>
                      {proofFile ? proofFile.name : 'Klik untuk memilih berkas bukti transfer'}
                    </span>
                    <span className={styles.fileUploadHint}>
                      Format didukung: JPG, PNG, WebP (Maksimal 10MB)
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className={styles.fileInputHidden}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setProofFile(e.target.files[0]);
                          setProofError(null);
                        }
                      }}
                    />
                  </label>
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={() => setIsUploadModalOpen(false)}
                    disabled={isUploadingProof}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className={styles.modalSubmitBtn}
                    disabled={!proofFile || isUploadingProof}
                  >
                    {isUploadingProof ? (
                      <>
                        <RefreshCw size={15} />
                        <span>Mengunggah...</span>
                      </>
                    ) : (
                      <>
                        <Check size={15} />
                        <span>Kirim Bukti Pembayaran</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
