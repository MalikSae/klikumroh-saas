'use client';

import React from 'react';
import { Plus, ChevronDown, ArrowRight } from 'lucide-react';
import styles from './MarketingProspectFeature.module.css';

const PROSPECTS = [
  {
    name: 'Hj. Maryam',
    package: 'Umroh Syawal',
    source: 'Agen • Nisa',
    status: 'tertarik',
    statusLabel: 'Tertarik',
    date: 'Hari ini',
  },
  {
    name: 'Bapak Fajar',
    package: 'Umroh Reguler',
    source: 'Organik',
    status: 'dihubungi',
    statusLabel: 'Dihubungi',
    date: 'Hari ini',
  },
  {
    name: 'Ibu Salma',
    package: 'Umroh Plus Turki',
    source: 'Agen • Hakim',
    status: 'baru',
    statusLabel: 'Baru',
    date: 'Kemarin',
  },
  {
    name: 'Keluarga Ridwan',
    package: 'Ramadan Akhir',
    source: 'Paid ads',
    status: 'closing',
    statusLabel: 'Closing',
    date: '2 hari lalu',
  },
];

export const MarketingProspectFeature: React.FC = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        {/* Left: Copy */}
        <div className={styles.featureCopy}>
          <span className={styles.featureNumber}>02  —  MANAJEMEN PROSPEK</span>
          <h2 className={styles.featureHeadline}>
            Agen dan tim travel menangani prospek dalam pipeline yang sama.
          </h2>
          <p className={styles.featureBody}>
            Agen dapat memperbarui follow-up jamaahnya. Tim travel melihat progres yang sama, ikut menambahkan catatan, dan mengonfirmasi saat prospek benar-benar closing.
          </p>

          <div className={styles.pipelinePills}>
            <span className={styles.pillBaru}>Baru</span>
            <ArrowRight size={14} className={styles.pillArrow} />
            <span className={styles.pillDihubungi}>Dihubungi</span>
            <ArrowRight size={14} className={styles.pillArrow} />
            <span className={styles.pillTertarik}>Tertarik</span>
            <ArrowRight size={14} className={styles.pillArrow} />
            <span className={styles.pillClosing}>Closing</span>
          </div>
        </div>

        {/* Right: Prospect Dashboard Table Preview */}
        <div className={styles.tableWrapper}>
          <div className={styles.tableCard}>
            {/* Header */}
            <div className={styles.tableHeader}>
              <div className={styles.titleGroup}>
                <h3 className={styles.tableTitle}>Prospek</h3>
                <span className={styles.tableCaption}>Data contoh • 48 calon jamaah</span>
              </div>
              <button type="button" className={styles.addBtn}>
                <Plus size={15} />
                <span>Tambah prospek</span>
              </button>
            </div>

            {/* Filters */}
            <div className={styles.filtersRow}>
              <div className={styles.filterBtn}>
                <span>Semua status</span>
                <ChevronDown size={14} />
              </div>
              <div className={styles.filterBtn}>
                <span>Semua sumber</span>
                <ChevronDown size={14} />
              </div>
              <div className={styles.filterBtn}>
                <span>September 2026</span>
                <ChevronDown size={14} />
              </div>
            </div>

            {/* Table */}
            <div className={styles.tableResponsive}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>JAMAAH</th>
                    <th>PAKET</th>
                    <th>SUMBER</th>
                    <th>STATUS</th>
                    <th>MASUK</th>
                  </tr>
                </thead>
                <tbody>
                  {PROSPECTS.map((row, idx) => (
                    <tr key={idx}>
                      <td className={styles.cellName}>{row.name}</td>
                      <td className={styles.cellMuted}>{row.package}</td>
                      <td className={styles.cellMuted}>{row.source}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles['status_' + row.status]}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className={styles.cellMuted}>{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
