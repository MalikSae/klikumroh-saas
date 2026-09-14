import React from 'react';
import { Building2, Plane, Users, CheckCircle2 } from 'lucide-react';
import './BenefitList.css';

// TODO: ganti dengan data dari API setelah backend section ini dibangun
const BENEFITS = [
  {
    id: 1,
    icon: <Building2 size={20} />,
    title: 'Hotel Nyaman Dekat Masjid',
    description: 'Akomodasi bintang 4 & 5 dengan jarak dekat ke Masjidil Haram dan Masjid Nabawi.',
  },
  {
    id: 2,
    icon: <Plane size={20} />,
    title: 'Penerbangan Langsung & Terjadwal',
    description: 'Menggunakan maskapai terpercaya dengan kepastian tanggal keberangkatan tanpa transit lama.',
  },
  {
    id: 3,
    icon: <Users size={20} />,
    title: 'Pembimbing Ibadah Sesuai Sunnah',
    description: 'Didampingi Ustadz / Muthawif berpengalaman dan bersertifikasi selama di Tanah Suci.',
  },
  {
    id: 4,
    icon: <CheckCircle2 size={20} />,
    title: 'Legalitas & Transparansi Biaya',
    description: 'Izin resmi Kemenag RI, rincian biaya transparan tanpa pungutan tambahan tersembunyi.',
  },
];

export const BenefitList: React.FC = () => {
  return (
    <section className="tw-benefits">
      <div className="tw-benefits__header">
        <span className="tw-benefits__tag">Keunggulan Layanan</span>
        <h2 className="tw-benefits__title">Kenapa Memilih Kami?</h2>
      </div>

      <div className="tw-benefits__grid">
        {BENEFITS.map((item) => (
          <div key={item.id} className="tw-benefit-card">
            <div className="tw-benefit-card__icon">{item.icon}</div>
            <div className="tw-benefit-card__content">
              <span className="tw-benefit-card__title">{item.title}</span>
              <span className="tw-benefit-card__desc">{item.description}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
