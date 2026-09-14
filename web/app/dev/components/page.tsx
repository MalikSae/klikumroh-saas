'use client';

import React, { useState } from 'react';
import { MobileContainer } from '../../../components/MobileContainer';
import { Button } from '../../../components/Button';
import { PackageCard } from '../../../components/PackageCard';
import { FormInput } from '../../../components/FormInput';
import './dev-components.css';

export default function DevComponentsPage() {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    packageId: '1',
    notes: '',
  });

  return (
    <MobileContainer>
      <div className="tw-dev-page">
        <header className="tw-dev-header">
          <span className="tw-dev-header__badge">Web Whitelabel</span>
          <h1 className="tw-dev-header__title">Component Library (Mobile-Locked)</h1>
          <p className="tw-dev-header__desc">
            Preview komponen publik yang mengonsumsi CSS custom property tenant: <code>--tw-*</code>
          </p>
        </header>

        {/* Section 1: Package Cards */}
        <section className="tw-dev-section">
          <h2 className="tw-dev-section__title">1. Card Paket Umroh</h2>
          <div className="tw-dev-stack">
            <PackageCard
              name="Umroh Reguler Syawal 1448H (9 Hari)"
              price={29500000}
              departureDateRaw="2027-04-18"
              quota={12}
              badge="Paling Diminati"
              onSelect={() => alert('Paket Reguler dipilih')}
            />

            <PackageCard
              name="Umroh VIP Bintang 5 Plus Kereta Cepat (12 Hari)"
              price={44900000}
              departureDateRaw="2027-05-02"
              quota={4}
              badge="Sisa 4 Kursi"
              onSelect={() => alert('Paket VIP dipilih')}
            />
          </div>
        </section>

        {/* Section 2: Form Minat */}
        <section className="tw-dev-section">
          <h2 className="tw-dev-section__title">2. Form Minat Publik</h2>
          <div className="tw-dev-box">
            <FormInput
              label="Nama Lengkap"
              placeholder="Contoh: H. Abdullah"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <FormInput
              type="tel"
              label="Nomor WhatsApp"
              placeholder="0812-xxxx-xxxx"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              hint="Tim konsultan travel akan menghubungi via WhatsApp."
              required
            />

            <FormInput
              type="select"
              label="Paket yang Diminati"
              value={formData.packageId}
              onChange={(e) => setFormData({ ...formData, packageId: e.target.value })}
              options={[
                { value: '1', label: 'Umroh Reguler Syawal (Rp 29.5 Jt)' },
                { value: '2', label: 'Umroh VIP Bintang 5 (Rp 44.9 Jt)' },
              ]}
              required
            />

            <FormInput
              type="textarea"
              label="Catatan Tambahan (Opsional)"
              placeholder="Jumlah jamaah, rencana keberangkatan..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />

            <Button variant="primary" size="lg" onClick={() => alert('Form Minat Terkirim!')}>
              Kirim Formulir Minat
            </Button>
          </div>
        </section>

        {/* Section 3: Buttons */}
        <section className="tw-dev-section">
          <h2 className="tw-dev-section__title">3. Buttons & Variants</h2>
          <div className="tw-dev-box">
            <Button variant="primary" size="md">
              Primary Button (Brand Color)
            </Button>
            <Button variant="secondary" size="md">
              Secondary Button (Outline)
            </Button>
            <Button variant="primary" size="sm" fullWidth={false}>
              Small Compact Button
            </Button>
            <Button variant="primary" disabled size="md">
              Disabled State
            </Button>
          </div>
        </section>
      </div>
    </MobileContainer>
  );
}
