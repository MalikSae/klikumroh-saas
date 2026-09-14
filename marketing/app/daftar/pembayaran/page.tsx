import React, { Suspense } from 'react';
import { Section01Navbar } from '../../../components/Section01Navbar';
import { Section19Footer } from '../../../components/Section19Footer';
import { PembayaranContent } from './PembayaranContent';
import '../../../components/sections.css';

export default function PembayaranPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Section01Navbar />

      <main style={{ flex: 1 }}>
        <Suspense fallback={<div style={{ textAlign: 'center', padding: '96px' }}>Memuat informasi pembayaran...</div>}>
          <PembayaranContent />
        </Suspense>
      </main>

      <Section19Footer />
    </div>
  );
}
