// Shared by the staff affiliator list and detail views.
import { formatDateWIB } from '../../../utils/datetime';

export const formatIDR = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
export const formatDateID = (iso?: string | null) => formatDateWIB(iso);

export const PAYOUT_PILL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Menunggu transfer', cls: 'sa-pill--amber' },
  paid: { label: 'Sudah ditransfer', cls: 'sa-pill--green' },
  rejected: { label: 'Ditolak', cls: 'sa-pill--red' },
};
