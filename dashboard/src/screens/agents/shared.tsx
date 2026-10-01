// Helpers shared by the Agen screens.
import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { PillTone } from '../../ui';

export const AGENT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  active: { label: 'Aktif', tone: 'green' },
  inactive: { label: 'Nonaktif', tone: 'gray' },
  pending: { label: 'Menunggu persetujuan', tone: 'amber' },
  rejected: { label: 'Ditolak', tone: 'red' },
};

export const REG_PAYMENT: Record<string, { label: string; tone: PillTone } | null> = {
  not_applicable: null,
  awaiting_proof: { label: 'Belum bayar', tone: 'gray' },
  pending_verification: { label: 'Bukti perlu dicek', tone: 'amber' },
  verified: { label: 'Terverifikasi', tone: 'green' },
};

export const PAYOUT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'Menunggu persetujuan', tone: 'amber' },
  approved: { label: 'Siap ditransfer', tone: 'blue' },
  paid: { label: 'Sudah ditransfer', tone: 'green' },
  rejected: { label: 'Ditolak', tone: 'red' },
};

/** wa.me link from a local (08xx) or international (62xx) number. */
export const waHref = (phone?: string | null) => {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d.length >= 10 ? `https://wa.me/${d}` : null;
};

export const CopyText: React.FC<{ value: string; label: string; children?: React.ReactNode }> = ({ value, label, children }) => {
  const [copied, setCopied] = useState(false);
  return (
    <span className="ag-copy">
      {children ?? value}
      <button
        type="button"
        className="ag-copy__btn"
        aria-label={`Salin ${label}`}
        title={copied ? 'Tersalin' : `Salin ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
        }}
      >
        {copied ? <Check className="ku-icon--sm" aria-hidden="true" /> : <Copy className="ku-icon--sm" aria-hidden="true" />}
      </button>
    </span>
  );
};
