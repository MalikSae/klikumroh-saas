import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  RefreshCw,
  Globe,
  ChevronRight,
  MessageCircle,
  AlertCircle,
  ExternalLink,
  Search,
} from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import {
  fetchStaffTenants,
  type StaffTenantItem,
} from '../../../services/staffApi';

export const AdminTenantsView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);

  const [allTenants, setAllTenants] = useState<StaffTenantItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStaffTenants('all');
      setAllTenants(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data biro travel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const param = searchParams.get('status') || 'all';
    setStatusFilter(param);
  }, [searchParams]);

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

  const cleanWa = (num?: string | null) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    }
    return digits;
  };


  // Metrics summary calculated from ALL tenants
  const totalTenants = allTenants.length;
  const activeTenants = allTenants.filter((t) => (t.subscription_status || t.status) === 'active').length;
  const pendingTenants = allTenants.filter((t) => (t.subscription_status || t.status) === 'pending').length;
  const expiredTenants = allTenants.filter((t) => (t.subscription_status || t.status) === 'expired').length;
  const customDomainTenants = allTenants.filter((t) => Boolean(t.custom_domain)).length;

  // Filter & Search
  const filteredTenants = allTenants.filter((t) => {
    const status = t.subscription_status || t.status || 'trial';
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && status !== 'active') return false;
      if (statusFilter === 'pending' && status !== 'pending') return false;
      if (statusFilter === 'expired' && status !== 'expired') return false;
    }

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.custom_domain && t.custom_domain.toLowerCase().includes(q)) ||
      (t.whatsapp_number && t.whatsapp_number.includes(q))
    );
  });

  const filterTabs = [
    { key: 'all', label: 'Semua Status', count: totalTenants },
    { key: 'active', label: 'Aktif', count: activeTenants },
    { key: 'pending', label: 'Pending', count: pendingTenants },
    { key: 'expired', label: 'Kedaluwarsa', count: expiredTenants },
  ];

  const handleTabClick = (key: string) => {
    setStatusFilter(key);
    if (key === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', key);
    }
    setSearchParams(searchParams);
  };

  return (
    <AdminLayout
      title="Daftar Travel Mitra"
      subtitle="Pusat kendali biro travel umroh, status langganan, dan domain publik"
      tooltipText="Halaman ini menampilkan seluruh tenant travel yang terdaftar di platform KlikUmroh beserta status langganan dan domainnya."
      headerActions={
        <button
          type="button"
          className="sa-action-btn"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
      }
    >
      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-red-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* EXECUTIVE FLEET METRIC RIBBON */}
      <div className="sa-metric-ribbon">
        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Total Travel Mitra</span>
          <div className="sa-metric-cell__val">{totalTenants}</div>
          <span className="sa-metric-cell__sub">Biro Travel Terdaftar</span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Langganan Aktif</span>
          <div className="sa-metric-cell__val" style={{ color: 'var(--sa-green-text)' }}>
            {activeTenants}
          </div>
          <span className="sa-metric-cell__sub">Mitra Menghasilkan MRR</span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Perlu Follow Up</span>
          <div className="sa-metric-cell__val" style={{ color: 'var(--sa-amber-text)' }}>
            {pendingTenants}
          </div>
          <span className="sa-metric-cell__sub">Trial / Menunggu Pembayaran</span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Domain Kustom</span>
          <div className="sa-metric-cell__val">{customDomainTenants}</div>
          <span className="sa-metric-cell__sub">Menggunakan Domain Sendiri</span>
        </div>
      </div>

      {/* INTEGRATED FLEET DATA GRID */}
      <div className="sa-data-panel">
        <div className="sa-data-panel__bar">
          <div className="sa-data-panel__bar-left">
            <div className="sa-filter-group">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabClick(tab.key)}
                  className={`sa-filter-btn ${statusFilter === tab.key ? 'sa-filter-btn--active' : ''}`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span style={{ fontSize: '10.5px', opacity: 0.75 }}>
                      ({tab.count})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="sa-data-panel__bar-right">
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                maxWidth: '240px',
              }}
            >
              <Search size={13} style={{ position: 'absolute', left: '10px', color: 'var(--sa-text-muted)' }} />
              <input
                type="text"
                placeholder="Filter nama, slug, domain..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  height: '32px',
                  padding: '0 10px 0 30px',
                  fontSize: '12px',
                  border: '1px solid var(--sa-border)',
                  borderRadius: 'var(--sa-radius-sm)',
                  backgroundColor: 'var(--sa-bg)',
                  outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Data Grid Table */}
        <div className="sa-table-scroller">
          <table className="sa-grid">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>ID</th>
                <th style={{ width: '220px', maxWidth: '220px' }}>Biro Travel</th>
                <th>Kontak WhatsApp</th>
                <th>Domain Kustom</th>
                <th>Paket Langganan</th>
                <th>Berlaku Hingga</th>
                <th>Status</th>
                <th>Terdaftar</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--sa-text-muted)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={16} className="db-spin" />
                      <span>Memuat data biro travel...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--sa-text-muted)' }}>
                    Tidak ada travel mitra yang sesuai dengan pencarian
                  </td>
                </tr>
              ) : (
                filteredTenants.map((row) => {
                  const status = row.subscription_status || row.status || 'trial';
                  const plan = row.plan_name || row.current_plan;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/internal/tenants/${row.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ color: 'var(--sa-text-muted)', fontFamily: 'var(--sa-font-code)', fontSize: '12px' }}>
                        #{row.id}
                      </td>

                      <td style={{ width: '220px', maxWidth: '220px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '220px', minWidth: 0 }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: 'var(--sa-text)',
                              fontSize: '13.5px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'block',
                            }}
                            title={row.name}
                          >
                            {row.name}
                          </span>
                          <a
                            href={`http://${row.slug}.klikumroh.id`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sa-tenant-domain"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              color: 'var(--sa-text-muted)',
                              fontSize: '12px',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              maxWidth: '100%',
                            }}
                            title={`${row.slug}.klikumroh.id`}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {row.slug}.klikumroh.id
                            </span>
                            <ExternalLink size={10} style={{ flexShrink: 0 }} />
                          </a>
                        </div>
                      </td>

                      <td>
                        {row.whatsapp_number ? (
                          <a
                            href={`https://wa.me/${cleanWa(row.whatsapp_number)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Chat WhatsApp"
                            style={{
                              color: 'var(--sa-text)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12.5px',
                              textDecoration: 'none',
                              fontFamily: 'var(--sa-font-code)',
                            }}
                          >
                            <MessageCircle size={13} style={{ color: 'var(--sa-green)' }} />
                            <span>{row.whatsapp_number}</span>
                          </a>
                        ) : (
                          <span style={{ color: 'var(--sa-text-subtle)', fontSize: '12px' }}>-</span>
                        )}
                      </td>

                      <td>
                        {row.custom_domain ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                            <Globe size={13} style={{ color: 'var(--sa-blue-text)' }} />
                            <strong style={{ color: 'var(--sa-text)' }}>{row.custom_domain}</strong>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--sa-text-subtle)', fontSize: '12px' }}>-</span>
                        )}
                      </td>

                      <td>
                        {plan ? (
                          <span className="sa-pill sa-pill--neutral">
                            {plan}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--sa-text-subtle)', fontSize: '12px' }}>Tanpa Paket</span>
                        )}
                      </td>

                      <td style={{ fontSize: '12.5px', fontWeight: 500 }}>
                        {formatDate(row.subscription_expires_at)}
                      </td>

                      <td>
                        {status === 'active' && (
                          <span className="sa-pill sa-pill--green">
                            <span className="sa-status-dot" style={{ backgroundColor: 'var(--sa-green)' }} />
                            <span>Aktif</span>
                          </span>
                        )}
                        {status === 'pending' && (
                          <span className="sa-pill sa-pill--amber">
                            <span className="sa-status-dot" style={{ backgroundColor: 'var(--sa-amber)' }} />
                            <span>Pending</span>
                          </span>
                        )}
                        {status === 'expired' && (
                          <span className="sa-pill sa-pill--red">
                            <span className="sa-status-dot" style={{ backgroundColor: 'var(--sa-red)' }} />
                            <span>Kedaluwarsa</span>
                          </span>
                        )}
                        {status !== 'active' && status !== 'pending' && status !== 'expired' && (
                          <span className="sa-pill sa-pill--neutral">{status}</span>
                        )}
                      </td>

                      <td style={{ fontSize: '12px', color: 'var(--sa-text-muted)' }}>
                        {formatDate(row.created_at)}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="sa-action-btn sa-action-btn--primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/internal/tenants/${row.id}`);
                          }}
                        >
                          <span>Kelola</span>
                          <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--sa-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: 'var(--sa-text-muted)',
            backgroundColor: 'var(--sa-card)',
          }}
        >
          <span>Menampilkan {filteredTenants.length} dari total {allTenants.length} travel mitra</span>
          <span style={{ fontFamily: 'var(--sa-font-code)' }}>1/1</span>
        </div>
      </div>
    </AdminLayout>
  );
};
