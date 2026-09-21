import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Badge } from './Badge';
import { Printer, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { PaymentVerificationItem } from '../services/staffApi';
import klikumrohLogo from '../assets/klikumroh-logo.png';

export interface OfficialReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PaymentVerificationItem | null;
}

export const OfficialReceiptModal: React.FC<OfficialReceiptModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  if (!item) return null;

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const receiptYearMonth = item.created_at ? item.created_at.slice(0, 7).replace('-', '') : '202609';
  const receiptNumber = `INV/KLIK/${receiptYearMonth}/${String(item.id).padStart(5, '0')}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kuitansi Resmi Pembayaran Platform"
    >
      <div id="printable-receipt" style={{ padding: '8px 4px' }}>
        {/* Receipt Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '2px solid var(--db-border)',
            paddingBottom: '18px',
            marginBottom: '20px',
          }}
        >
          <div>
            <img src={klikumrohLogo} alt="KlikUmroh.id" style={{ height: '36px', marginBottom: '8px' }} />
            <div style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>
              Platform SaaS Whitelabel Umroh & Haji Indonesia
            </div>
            <div style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
              support@klikumroh.id • www.klikumroh.id
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--db-text-muted)', textTransform: 'uppercase' }}>
              Nomor Kuitansi
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--db-primary)' }}>
              {receiptNumber}
            </div>
            <div style={{ marginTop: '6px' }}>
              <Badge variant="positive" showArrow={false}>
                <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                <span>LUNAS & TERVERIFIKASI</span>
              </Badge>
            </div>
          </div>
        </div>

        {/* Tenant Information */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            backgroundColor: 'var(--db-surface-hover)',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            border: '1px solid var(--db-border)',
          }}
        >
          <div>
            <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block' }}>
              Diterima Dari (Travel Mitra):
            </span>
            <strong style={{ fontSize: '15px', color: 'var(--db-text-primary)' }}>
              {item.tenant_name || `Tenant #${item.tenant_id}`}
            </strong>
            <div style={{ fontSize: '13px', color: 'var(--db-text-secondary)', marginTop: '2px' }}>
              Subdomain: {item.tenant_slug ? `${item.tenant_slug}.klikumroh.id` : '-'}
            </div>
            {item.tenant_whatsapp && (
              <div style={{ fontSize: '13px', color: 'var(--db-text-secondary)' }}>
                WhatsApp: {item.tenant_whatsapp}
              </div>
            )}
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block' }}>
              Waktu Transaksi & Approval:
            </span>
            <div style={{ fontSize: '13px', color: 'var(--db-text-primary)', marginTop: '2px' }}>
              Diajukan: {formatDate(item.created_at)}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--db-positive)', fontWeight: 600, marginTop: '2px' }}>
              Disetujui: {formatDate(item.reviewed_at)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginTop: '2px' }}>
              Petugas Verifikasi: {item.reviewed_by_name || 'Staff KlikUmroh'}
            </div>
          </div>
        </div>

        {/* Rincian Pembayaran Table */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--db-border)', backgroundColor: 'var(--db-surface-hover)' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--db-text-primary)' }}>Deskripsi Paket</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--db-text-primary)' }}>Durasi</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--db-text-primary)' }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--db-border)' }}>
              <td style={{ padding: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
                  {item.plan_name || `Paket Langganan #${item.plan_id}`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                  Aktivasi platform SaaS KlikUmroh.id & domain sistem
                </div>
              </td>
              <td style={{ textAlign: 'center', padding: '12px', color: 'var(--db-text-primary)' }}>
                {item.plan_period_months ? `${item.plan_period_months} Bulan` : '-'}
              </td>
              <td style={{ textAlign: 'right', padding: '12px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                {formatIDR(item.amount)}
              </td>
            </tr>
            {item.coupon_code && (
              <tr style={{ borderBottom: '1px solid var(--db-border)' }}>
                <td style={{ padding: '10px 12px', color: 'var(--db-positive)' }}>
                  Diskon Kupon Promosi ({item.coupon_code})
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--db-text-muted)' }}>-</td>
                <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--db-positive)', fontWeight: 600 }}>
                  -{formatIDR(Math.max(0, item.amount - (item.final_amount - (item.unique_code || 0))))}
                </td>
              </tr>
            )}
            {Boolean(item.unique_code && item.unique_code > 0) && (
              <tr style={{ borderBottom: '1px solid var(--db-border)' }}>
                <td style={{ padding: '10px 12px', color: 'var(--db-text-muted)' }}>
                  Kode Unik Verifikasi Otomatis
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--db-text-muted)' }}>-</td>
                <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--db-text-muted)' }}>
                  +{formatIDR(item.unique_code || 0)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ textAlign: 'right', padding: '14px 12px', fontWeight: 700, fontSize: '15px' }}>
                Total Pembayaran Lunas:
              </td>
              <td style={{ textAlign: 'right', padding: '14px 12px', fontWeight: 700, fontSize: '18px', color: 'var(--db-primary)' }}>
                {formatIDR(item.final_amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Security & Verification Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--db-text-muted)',
            padding: '10px 14px',
            backgroundColor: 'var(--db-surface-hover)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '24px',
          }}
        >
          <ShieldCheck size={16} style={{ color: 'var(--db-positive)', flexShrink: 0 }} />
          <span>
            Kuitansi ini diterbitkan secara sah oleh sistem verifikasi internal PT KlikUmroh Digital Nusantara dan berlaku sebagai bukti bayar resmi langganan platform.
          </span>
        </div>

        {/* Modal Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button variant="secondary" size="md" onClick={onClose}>
            Tutup
          </Button>
          <Button variant="primary" size="md" onClick={handlePrint} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={16} />
            <span>Cetak / Unduh Kuitansi</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
