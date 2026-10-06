// Travels the affiliator brought: name and subscription status only (never prospects, agents, jamaah).
import React, { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { Banner, Card, DataTable, EmptyState, Pill, errorText, fmtDate, type Column, type PillTone } from '../../ui';
import { fetchAffiliatorTenants, type AffiliatorTenant } from '../../services/affiliatorApi';

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  // Derived subscription status from the API (same rules as super admin).
  pending: { label: 'Menunggu pembayaran', tone: 'amber' },
  active: { label: 'Aktif', tone: 'green' },
  expired: { label: 'Kedaluwarsa', tone: 'amber' },
  suspended: { label: 'Ditangguhkan', tone: 'red' },
  no_plan: { label: 'Belum berlangganan', tone: 'gray' },
  demo: { label: 'Demo', tone: 'gray' },
  inactive: { label: 'Nonaktif', tone: 'gray' },
};

const columns: Column<AffiliatorTenant>[] = [
  { key: 'name', header: 'Travel', cell: (t) => t.name },
  {
    key: 'status',
    header: 'Status',
    cell: (t) => {
      const s = STATUS[t.status] ?? { label: t.status, tone: 'gray' as PillTone };
      return <Pill tone={s.tone}>{s.label}</Pill>;
    },
  },
  { key: 'source', header: 'Lewat', cell: (t) => (t.source === 'coupon' ? 'Kupon' : 'Link'), mobile: 'labeled' },
  { key: 'joined', header: 'Mendaftar', cell: (t) => fmtDate(t.affiliated_at), mobile: 'labeled' },
  { key: 'expires', header: 'Aktif sampai', cell: (t) => fmtDate(t.subscription_expires_at), mobile: 'labeled' },
];

export const AffiliatorTravelsView: React.FC = () => {
  const [rows, setRows] = useState<AffiliatorTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAffiliatorTenants()
      .then(setRows)
      .catch((e) => setError(errorText(e, 'Gagal memuat travel')))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <Banner tone="danger">{error}</Banner>;
  return (
    <Card>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.tenant_id}
        loading={loading}
        empty={
          <EmptyState
            icon={<Store className="ku-icon" aria-hidden="true" />}
            title="Belum ada travel"
            description="Travel yang mendaftar lewat link atau kupon Anda akan muncul di sini."
            compact
          />
        }
      />
    </Card>
  );
};
