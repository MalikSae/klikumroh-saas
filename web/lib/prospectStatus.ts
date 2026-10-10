// The pipeline status of a jamaah (AGENTS.md 3.6: baru, dihubungi, tertarik, closing / tidak_lanjut): its label
// and its tone, in one place. "Lunas" is not a status; it is shown next to a closing (paid_off_at).
import type { StatusTone } from '../components/agent/StatusLabel';

export const PROSPECT_STATUS_LABEL: Record<string, string> = {
  baru: 'Baru',
  dihubungi: 'Dihubungi',
  tertarik: 'Tertarik',
  closing: 'Closing',
  tidak_lanjut: 'Tidak Lanjut',
};

export const prospectStatusLabel = (status: string): string => PROSPECT_STATUS_LABEL[status] || status;

// "Closing · Lunas" / "Closing · Belum lunas" for a closing, the plain label otherwise.
export const prospectStatusText = (status: string, paidOffAt?: string | null): string =>
  prospectStatusLabel(status) + (status === 'closing' ? (paidOffAt ? ' · Lunas' : ' · Belum lunas') : '');

const TONE: Record<string, StatusTone> = {
  baru: 'new',
  dihubungi: 'wait',
  tertarik: 'interested',
  closing: 'success',
};

export const prospectStatusTone = (status: string): StatusTone => TONE[status] || 'muted';
