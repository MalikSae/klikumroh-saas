import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  StatCard,
  Card,
  Button,
  Badge,
  Table,
  FormInput,
  Modal,
  getStandardMenuItems,
} from '../components';
import './DevComponents.css';

export const DevComponentsPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: 'PT Cahaya Haramain Travel',
    scheme: 'flat',
    notes: 'Mitra travel umroh area Surabaya dan sekitarnya.',
  });

  const menuItems = getStandardMenuItems('components');

  const tableColumns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Nama Jamaah' },
    { key: 'phone', label: 'No. WhatsApp' },
    { key: 'channel', label: 'Channel' },
    {
      key: 'status',
      label: 'Status',
      render: (row: any) => (
        <Badge variant={row.status === 'closing' ? 'positive' : 'negative'} showArrow={false}>
          {row.status.toUpperCase()}
        </Badge>
      ),
    },
  ];

  const tableData = [
    { id: '#PR-101', name: 'H. Ahmad Dahlan', phone: '0812-3456-7890', channel: 'Referral Agen', status: 'closing' },
    { id: '#PR-102', name: 'Siti Aminah', phone: '0813-9876-5432', channel: 'Instagram Ads', status: 'tertarik' },
    { id: '#PR-103', name: 'Bambang Sudarsono', phone: '0821-4455-6677', channel: 'Organik Web', status: 'baru' },
    { id: '#PR-104', name: 'Hj. Fatimah Zahra', phone: '0857-1122-3344', channel: 'Referral Agen', status: 'closing' },
    { id: '#PR-105', name: 'Muhammad Ridwan', phone: '0819-2233-4455', channel: 'Facebook Ads', status: 'dihubungi' },
    { id: '#PR-106', name: 'Dewi Sartika', phone: '0878-3344-5566', channel: 'Organik Web', status: 'tertarik' },
    { id: '#PR-107', name: 'Agus Setiawan', phone: '0811-5566-7788', channel: 'Referral Agen', status: 'tidak_lanjut' },
    { id: '#PR-108', name: 'Nurul Hidayati', phone: '0822-6677-8899', channel: 'Instagram Ads', status: 'closing' },
    { id: '#PR-109', name: 'H. Suryanto', phone: '0813-7788-9900', channel: 'Referral Agen', status: 'closing' },
    { id: '#PR-110', name: 'Rina Kusuma', phone: '0856-8899-0011', channel: 'Organik Web', status: 'dihubungi' },
    { id: '#PR-111', name: 'dr. Hendra Pratama', phone: '0812-9900-1122', channel: 'Referral Agen', status: 'tertarik' },
    { id: '#PR-112', name: 'Sri Wahyuni', phone: '0877-0011-2233', channel: 'Tiktok Live', status: 'baru' },
  ];

  return (
    <div className="db-dev-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-dev-main">
        <Topbar
          travelName="KlikUmroh Design System"
          userName="Admin Travel"
          userRole="Administrator"
          userInitial="AD"
        />

        <main className="db-dev-content">
          <PageHeader
            title="Component Library Showcase"
            subtitle="Preview semua komponen dasar, PageHeader, token warna, dan layout standar dashboard admin"
            actions={
              <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)}>
                <Plus size={16} />
                <span>Buka Modal Contoh</span>
              </Button>
            }
          />
          {/* Section 1: StatCards & Badges */}
          <section className="db-dev-section">
            <h2 className="db-dev-section__title">1. StatCard & Badge (Pola Vizora)</h2>
            <div className="db-dev-grid db-dev-grid--3">
              <StatCard
                label="Total Prospek Baru"
                value="128"
                trend={{ variant: 'positive', label: '+18.4%' }}
                footerNote="Dibandingkan 30 hari sebelumnya"
              />
              <StatCard
                label="Closing Bulan Ini"
                value="34 Jamaah"
                trend={{ variant: 'positive', label: '+12.0%' }}
                footerNote="Nilai closing Rp 1.12 Miliar"
              />
              <StatCard
                label="Drop / Tidak Lanjut"
                value="9"
                trend={{ variant: 'negative', label: '-3.2%' }}
                footerNote="Mayoritas alasan: reschedule jadwal"
              />
            </div>
          </section>

          {/* Section 2: Buttons & Badges */}
          <section className="db-dev-section">
            <h2 className="db-dev-section__title">2. Buttons & Badges</h2>
            <Card>
              <div className="db-dev-row">
                <div className="db-dev-group">
                  <span className="db-dev-group__label">Button Variants:</span>
                  <div className="db-dev-row">
                    <Button variant="primary" size="sm">Primary Small</Button>
                    <Button variant="primary" size="md">Primary Medium</Button>
                    <Button variant="primary" size="lg">Primary Large</Button>
                    <Button variant="secondary" size="md">Secondary Button</Button>
                    <Button variant="primary" disabled size="md">Disabled</Button>
                  </div>
                </div>

                <div className="db-dev-group">
                  <span className="db-dev-group__label">Badge Indicators:</span>
                  <div className="db-dev-row">
                    <Badge variant="positive">+24.5% Naik</Badge>
                    <Badge variant="negative">-8.1% Turun</Badge>
                    <Badge variant="positive" showArrow={false}>Aktif</Badge>
                    <Badge variant="negative" showArrow={false}>Non-aktif</Badge>
                  </div>
                </div>

                <div className="db-dev-group">
                  <span className="db-dev-group__label">Pipeline Status Badges (Option B):</span>
                  <div className="db-dev-row">
                    <Badge variant="new" showArrow={false}>Baru</Badge>
                    <Badge variant="contacted" showArrow={false}>Dihubungi</Badge>
                    <Badge variant="interested" showArrow={false}>Tertarik</Badge>
                    <Badge variant="closing" showArrow={false}>Closing</Badge>
                    <Badge variant="lost" showArrow={false}>Tidak Lanjut</Badge>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* Section 3: Generic Table */}
          <section className="db-dev-section">
            <h2 className="db-dev-section__title">3. Table Generik (Search, Filter & Pagination)</h2>
            <Table
              columns={tableColumns}
              data={tableData}
              pageSize={5}
              pageSizeOptions={[5, 10, 20]}
              searchPlaceholder="Cari nama, no. WhatsApp, channel..."
              emptyMessage="Tidak ada data jamaah"
            />
          </section>

          {/* Section 4: Form Inputs */}
          <section className="db-dev-section">
            <h2 className="db-dev-section__title">4. Form Input (Text, Select, Textarea)</h2>
            <Card title="Pengaturan Travel (Dummy Form)">
              <div className="db-dev-form-grid">
                <FormInput
                  label="Nama Travel"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Masukkan nama travel"
                  required
                />
                <FormInput
                  type="select"
                  label="Skema Komisi Agen"
                  value={formData.scheme}
                  onChange={(e) => setFormData({ ...formData, scheme: e.target.value })}
                  options={[
                    { value: 'flat', label: 'Flat (Rp per jamaah)' },
                    { value: 'override_one_tier', label: 'Override 1 Tier (Multi-level)' },
                  ]}
                  required
                />
                <FormInput
                  type="textarea"
                  label="Catatan Operasional"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  hint="Catatan ini hanya terlihat oleh admin travel."
                />
              </div>
            </Card>
          </section>
        </main>
      </div>

      {/* Modal Dialog */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Contoh Dialog Modal"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsModalOpen(false)}>
              Simpan Perubahan
            </Button>
          </>
        }
      >
        <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--db-text-primary)' }}>
          Ini adalah komponen Modal generik yang mendukung penutupan via tombol silang, klik backdrop, maupun tombol <strong>ESC</strong> pada keyboard.
        </p>
      </Modal>
    </div>
  );
};
