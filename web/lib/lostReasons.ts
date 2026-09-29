// Fixed reasons for 'Tidak Lanjut' (same keys as service.LostReasonCategories in the Go backend).
// "batal_setelah_dp" is set only by the admin's Batalkan Closing, so it is not selectable here.
export const LOST_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'harga', label: 'Harga tidak cocok' },
  { value: 'jadwal', label: 'Jadwal tidak cocok' },
  { value: 'dana', label: 'Dana belum siap' },
  { value: 'travel_lain', label: 'Memilih travel lain' },
  { value: 'tidak_respons', label: 'Tidak merespons' },
  { value: 'lainnya', label: 'Lainnya' },
];

// Planned departure month "YYYY-MM" as a readable label (e.g. "Desember 2026").
export const formatDeparturePlan = (value?: string | null): string => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return '-';
  const [y, m] = value.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};
