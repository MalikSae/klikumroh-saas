// Riwayat akses staf: every time KlikUmroh staff open this travel's data (read-only audit trail).
import React, { useEffect, useState } from 'react';
import { fetchAccessLogs, type AccessLogItem } from '../../services/api';
import { Banner, DataTable, EmptyState, Toolbar, type Column, errorText } from '../../ui';

const ACTION_LABEL: Record<string, string> = {
  lihat_detail_travel: 'Melihat detail travel',
  mulai_impersonasi: 'Masuk ke dashboard travel',
  akses_dashboard: 'Membuka data di dashboard',
  reset_password_admin: 'Mereset password admin',
  ubah_langganan: 'Mengubah langganan',
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const AccessLogSettings: React.FC = () => {
  const [rows, setRows] = useState<AccessLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccessLogs()
      .then(setRows)
      .catch((e) => setError(errorText(e, 'Gagal memuat data')))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<AccessLogItem>[] = [
    { key: 'when', header: 'Waktu', cell: (r) => fmtDateTime(r.accessed_at) },
    { key: 'staff', header: 'Staf KlikUmroh', cell: (r) => r.staff_name || `Staf #${r.staff_id}` },
    { key: 'action', header: 'Aktivitas', cell: (r) => ACTION_LABEL[r.action] || r.action },
    {
      key: 'detail',
      header: 'Keterangan',
      cell: (r) => <span className="st-muted">{r.reason || [r.http_method, r.path].filter(Boolean).join(' ') || '—'}</span>,
    },
  ];

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar>
        <span className="st-muted">Tercatat otomatis setiap kali tim KlikUmroh membuka data travel Anda, misalnya saat membantu kendala.</span>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        empty={<EmptyState compact title="Belum ada akses dari tim KlikUmroh" description="Data travel Anda belum pernah dibuka oleh staf." />}
      />
    </section>
  );
};
