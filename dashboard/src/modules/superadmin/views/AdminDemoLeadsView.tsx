// Staff list of people who opened the demo dashboard (the demo asks for a short form first).
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { AdminDataGrid, type AdminColumn } from '../components/AdminDataGrid';
import { fetchDemoLeads, type DemoLead } from '../../../services/staffApi';
import { formatDateTimeWIB } from '../../../utils/datetime';

const nowrap: React.CSSProperties = { whiteSpace: 'nowrap' };

export const AdminDemoLeadsView: React.FC = () => {
  const [leads, setLeads] = useState<DemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeads(await fetchDemoLeads());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat lead demo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: AdminColumn<DemoLead>[] = [
    { key: 'name', label: 'Nama', render: (r) => <strong style={nowrap}>{r.name}</strong> },
    { key: 'phone', label: 'WhatsApp', render: (r) => <span style={nowrap}>{r.phone}</span> },
    { key: 'travel_name', label: 'Travel', render: (r) => <span style={nowrap}>{r.travel_name}</span> },
    { key: 'city', label: 'Domisili', render: (r) => <span style={nowrap}>{r.city}</span> },
    { key: 'visit_count', label: 'Dibuka', render: (r) => <span style={nowrap}>{r.visit_count}x</span> },
    { key: 'source', label: 'Sumber', render: (r) => <span className="sa-note" style={nowrap}>{r.source || '-'}</span> },
    { key: 'last_seen_at', label: 'Terakhir', render: (r) => <span style={nowrap}>{formatDateTimeWIB(r.last_seen_at)}</span> },
  ];

  return (
    <AdminLayout
      title="Lead Demo"
      subtitle="Siapa saja yang mencoba dashboard demo"
      headerActions={
        <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
      }
    >
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: 'var(--sa-radius-sm)',
            fontSize: '13px',
            display: 'flex',
            gap: '8px',
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            color: 'var(--sa-red-text)',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}
      <AdminDataGrid
        title="Pengguna Demo"
        data={leads}
        columns={columns}
        loading={loading}
        searchPlaceholder="Cari nama, nomor, atau travel..."
        searchKeys={['name', 'phone', 'travel_name', 'city']}
        emptyMessage="Belum ada yang membuka demo"
      />
    </AdminLayout>
  );
};
