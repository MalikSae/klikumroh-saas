import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Globe, AlertCircle, ChevronRight, MessageCircle } from 'lucide-react';
import {
  StaffLayout,
  PageHeader,
  Table,
  Badge,
  Button,
  type Column,
} from '../components';
import {
  fetchStaffTenants,
  type StaffTenantItem,
} from '../services/staffApi';

export const StaffTenantsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<StaffTenantItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStaffTenants();
      const validTenants = data.filter(
        (t) => (t.status || t.subscription_status) !== 'pending' && Boolean(t.current_plan || t.plan_name)
      );
      setTenants(validTenants);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar tenant');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const isExpired = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const exp = new Date(dateStr).getTime();
    return !isNaN(exp) && exp < Date.now();
  };

  const cleanWa = (num?: string | null) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    }
    return digits;
  };

  const columns: Column<StaffTenantItem>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (row) => (
        <span style={{ fontWeight: 500, color: 'var(--db-text-muted)' }}>
          #{row.id}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Nama Travel',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
            {row.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
            <span>{row.slug}.klikumroh.id</span>
          </div>
          {row.whatsapp_number && (
            <a
              href={`https://wa.me/${cleanWa(row.whatsapp_number)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--db-positive)',
                fontSize: '12px',
                fontWeight: 600,
                marginTop: '3px',
                textDecoration: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
              title="Hubungi Travel via WhatsApp"
            >
              <MessageCircle size={12} />
              <span>{row.whatsapp_number}</span>
            </a>
          )}
        </div>
      ),
    },
    {
      key: 'custom_domain',
      label: 'Domain Kustom',
      render: (row) => {
        if (!row.custom_domain) {
          return <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>-</span>;
        }
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
            <Globe size={13} style={{ color: 'var(--db-text-muted)' }} />
            <span>{row.custom_domain}</span>
          </div>
        );
      },
    },
    {
      key: 'plan_name',
      label: 'Plan Aktif',
      render: (row) => {
        const plan = row.plan_name || row.current_plan;
        if (!plan) {
          return <Badge variant="neutral" showArrow={false}>Belum Ada Plan</Badge>;
        }
        return <Badge variant="positive" showArrow={false}>{plan}</Badge>;
      },
    },
    {
      key: 'subscription_expires_at',
      label: 'Berlaku Hingga',
      render: (row) => {
        if (!row.subscription_expires_at) {
          return <span style={{ color: 'var(--db-text-muted)' }}>-</span>;
        }
        const expired = isExpired(row.subscription_expires_at);
        return (
          <div>
            <div style={{ fontWeight: 500, color: expired ? 'var(--db-negative)' : 'var(--db-text-primary)' }}>
              {formatDate(row.subscription_expires_at)}
            </div>
            {expired && (
              <span style={{ fontSize: '11px', color: 'var(--db-negative)', fontWeight: 600 }}>
                Kedaluwarsa
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'subscription_status',
      label: 'Status Langganan',
      render: (row) => {
        const status = row.subscription_status || row.status || 'trial';
        if (status === 'active') {
          return <Badge variant="positive" showArrow={false}>Aktif</Badge>;
        }
        if (status === 'pending') {
          return <Badge variant="contacted" showArrow={false}>Menunggu Verifikasi</Badge>;
        }
        if (status === 'trial') {
          return <Badge variant="neutral" showArrow={false}>Trial</Badge>;
        }
        if (status === 'expired') {
          return <Badge variant="negative" showArrow={false}>Kedaluwarsa</Badge>;
        }
        return <Badge variant="neutral" showArrow={false}>{status}</Badge>;
      },
    },
    {
      key: 'created_at',
      label: 'Terdaftar',
      render: (row) => (
        <span style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Aksi',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/internal/tenants/${row.id}`);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <span>Detail</span>
          <ChevronRight size={14} />
        </Button>
      ),
    },
  ];

  return (
    <StaffLayout title="Daftar Tenant">
      <PageHeader
        title="Daftar Tenant Travel"
        subtitle="Daftar seluruh travel umroh mitra yang aktif berlangganan atau masa aktifnya kedaluwarsa"
        actions={
          <Button variant="secondary" size="md" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
            <span>Segarkan</span>
          </Button>
        }
      />

      {error && (
        <div className="db-alert db-alert--error" style={{ marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <Table
        columns={columns}
        data={tenants}
        loading={loading}
        onRowClick={(row) => navigate(`/internal/tenants/${row.id}`)}
        searchPlaceholder="Cari nama travel, subdomain, atau domain..."
        searchKeys={['name', 'slug', 'custom_domain']}
        toolbarActions={
          <span style={{ fontSize: '13px', color: 'var(--db-text-muted)', fontWeight: 500 }}>
            Total: {tenants.length} Tenant
          </span>
        }
        emptyMessage="Belum ada data tenant terdaftar"
      />
    </StaffLayout>
  );
};
