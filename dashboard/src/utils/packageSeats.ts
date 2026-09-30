import type { PackageItem } from '../services/api';

/**
 * Warning shown before closing a prospect when its jamaah do not fit in the package quota.
 * Closing is not blocked: a travel may have added seats without updating the quota yet.
 * `seats_taken` counts only prospects already in Closing, so the prospect being closed is not in it.
 */
export function closingSeatsWarning(
  pkg: Pick<PackageItem, 'name' | 'quota' | 'seats_taken'> | null | undefined,
  jumlahJamaah: number | null | undefined
): string | null {
  if (!pkg || !pkg.quota || pkg.quota <= 0) return null;
  const taken = pkg.seats_taken ?? 0;
  const after = taken + (jumlahJamaah && jumlahJamaah > 0 ? jumlahJamaah : 1);
  if (after <= pkg.quota) return null;
  return `Kursi paket ${pkg.name} sudah terisi ${taken}/${pkg.quota}; closing ini membuatnya ${after}/${pkg.quota}. Tambah kuota di paket jika memang ada kursi tambahan.`;
}
