import React from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  Handshake,
  Globe,
  Boxes,
  Settings as SettingsIcon,
  ArrowRight,
} from 'lucide-react';
import { Sidebar, Topbar, PageHeader, Card, Button } from '../components';
import { Link } from 'react-router-dom';
import { getStoredUser } from '../services/api';

export const HomePlaceholder: React.FC = () => {
  const currentUser = getStoredUser();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', to: '/', icon: <LayoutDashboard size={18} />, active: true },
    { id: 'prospects', label: 'Data Prospek', to: '/prospects', icon: <Users size={18} /> },
    { id: 'packages', label: 'Katalog Paket', to: '/packages', icon: <Package size={18} /> },
    { id: 'agents', label: 'Sistem Agen', to: '/agents', icon: <Handshake size={18} /> },
    { id: 'website-content', label: 'Konten Beranda', to: '/website-content', icon: <Globe size={18} /> },
    { id: 'settings', label: 'Pengaturan', to: '/settings', icon: <SettingsIcon size={18} /> },
    { id: 'components', label: 'Component Library', to: '/dev/components', icon: <Boxes size={18} /> },
  ];

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: '880px' }}>
          <PageHeader
            title="Dashboard Ringkasan"
            subtitle="Selamat datang di panel administrasi travel KlikUmroh"
          />
          <Card title="Selamat Datang di KlikUmroh.id">
            <p style={{ fontSize: 'var(--font-size-md, 15px)', lineHeight: '1.6', color: 'var(--db-text-muted)', marginBottom: '16px' }}>
              Dashboard KlikUmroh — fitur akan dibangun di Sprint 2.
            </p>
            <p style={{ fontSize: 'var(--font-size-base, 14px)', lineHeight: '1.6', color: 'var(--db-text-primary)', marginBottom: '20px' }}>
              Fondasi database, repository layer dengan isolasi tenant, dan pustaka komponen dasar telah siap.
            </p>
            <Link to="/dev/components">
              <Button variant="primary" size="md">
                <span>Buka Showcase Component Library (/dev/components)</span>
                <ArrowRight size={16} />
              </Button>
            </Link>
          </Card>
        </main>
      </div>
    </div>
  );
};
