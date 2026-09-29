import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Table,
  Badge,
  Button,
  Tooltip,
  getStandardMenuItems,
  type Column,
} from '../components';
import {
  fetchAccessLogs,
  getStoredUser,
  getStoredTravelName,
  type AccessLogItem,
} from '../services/api';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Maps the first dashboard API path segment to a label travel admins recognise.
const RESOURCE_LABELS: Record<string, string> = {
  prospects: 'data prospek',
  packages: 'paket umroh',
  agents: 'data agen',
  'agent-targets': 'target agen',
  commissions: 'komisi agen',
  payouts: 'pencairan komisi',
  team: 'tim admin',
  me: 'profil admin',
  tenant: 'pengaturan travel',
  domains: 'domain',
  banners: 'banner promo',
  testimonials: 'testimoni',
  faqs: 'FAQ',
  overview: 'ringkasan dashboard',
  notifications: 'notifikasi',
  subscription: 'langganan',
  'pricing-plans': 'paket langganan',
  'platform-settings': 'pengaturan platform',
  'access-logs': 'riwayat akses staf',
};

const describeResource = (path?: string | null): string => {
  if (!path) return 'dashboard';
  const segment = path.replace(/^\/api\/dashboard\/?/, '').split('/')[0];
  return RESOURCE_LABELS[segment] || 'dashboard';
};

const isMutation = (log: AccessLogItem): boolean =>
  log.action === 'reset_password_admin' ||
  log.action === 'ubah_langganan' ||
  (log.action === 'akses_dashboard' && MUTATING_METHODS.includes((log.http_method || '').toUpperCase()));

const describeAction = (log: AccessLogItem): string => {
  switch (log.action) {
    case 'lihat_detail_travel':
      return 'Melihat ringkasan travel di panel internal';
    case 'mulai_impersonasi':
      return 'Masuk ke dashboard travel';
    case 'reset_password_admin':
      return 'Mereset password admin';
    case 'ubah_langganan':
      return 'Mengubah langganan';
    case 'akses_dashboard':
      return `${isMutation(log) ? 'Mengubah' : 'Membuka'} ${describeResource(log.path)}`;
    default:
      return log.action;
  }
};

const formatDateTime = (value: string): string => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type AccessLogRow = AccessLogItem & { description: string; accessed_label: string };

export const AccessLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const currentUser = getStoredUser();
  const menuItems = getStandardMenuItems('settings-access-log');

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAccessLogs();
      setLogs(
        data.map((l) => ({
          ...l,
          description: describeAction(l),
          accessed_label: formatDateTime(l.accessed_at),
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Gagal memuat riwayat akses staf');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const columns: Column<AccessLogRow>[] = [
    {
      key: 'accessed_label',
      label: 'Waktu',
    },
    {
      key: 'staff_name',
      label: 'Staf KlikUmroh',
      render: (row) => row.staff_name || `Staf #${row.staff_id}`,
    },
    {
      key: 'description',
      label: 'Aktivitas',
      render: (row) => (
        <Badge variant={isMutation(row) ? 'negative' : 'neutral'}>{row.description}</Badge>
      ),
    },
    {
      key: 'reason',
      label: 'Alasan',
      render: (row) => row.reason || '-',
    },
  ];

  return (
    <div className="db-main-layout">
      <Sidebar brandName="KlikUmroh.id" menuItems={menuItems} footerContent="KlikUmroh.id 1.0" />

      <div className="db-content-area">
        <Topbar
          travelName={getStoredTravelName()}
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container">
          <PageHeader
            title="Riwayat Akses Staf"
            subtitle="Setiap akses staf KlikUmroh ke data travel Anda tercatat otomatis."
            badge={
              <Tooltip content="Catatan dibuat sistem sebelum staf bisa membuka data, dan tidak bisa diubah atau dihapus oleh staf. Halaman yang dibuka berulang dalam 5 menit dicatat satu kali; setiap perubahan data selalu dicatat." />
            }
            actions={
              <Button variant="secondary" onClick={loadLogs} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'db-spin' : ''} />
                <span>Muat Ulang</span>
              </Button>
            }
          />

          {error && (
            <div className="db-alert db-alert--error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <Table
            columns={columns}
            data={logs}
            loading={loading}
            searchPlaceholder="Cari staf, aktivitas, atau alasan..."
            searchKeys={['staff_name', 'description', 'reason', 'accessed_label']}
            emptyMessage="Belum ada staf KlikUmroh yang mengakses data travel Anda"
          />
        </main>
      </div>
    </div>
  );
};
