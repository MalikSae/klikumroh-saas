'use client';

import React from 'react';
import { ArrowRight, Plus, ChevronDown, MessageSquare } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
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
  const [activeFilter, setActiveFilter] = React.useState<string>('semua');
  const [showToast, setShowToast] = React.useState<boolean>(false);

  const filteredProspects = activeFilter === 'semua'
    ? PROSPECTS
    : PROSPECTS.filter((p) => p.status === activeFilter);

  const handleAddProspectClick = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3500);
  };

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        {/* Left: Copy */}
        <ScrollReveal as="div" className={styles.featureCopy} animation="fade-up">
          <span className={styles.featureNumber}>02  —  MANAJEMEN PROSPEK</span>
          <h2 className={styles.featureHeadline}>
            Agen dan tim travel menangani prospek dalam pipeline yang sama.
          </h2>
          <p className={styles.featureBody}>
            Agen dapat memperbarui follow-up jamaahnya. Tim travel melihat progres yang sama, ikut menambahkan catatan, dan mengonfirmasi saat prospek benar-benar closing.
          </p>

          <div className={styles.pipelinePills}>
            <button
              type="button"
              className={`${styles.pillBtn} ${activeFilter === 'semua' ? styles.pillActive : ''}`}
              onClick={() => setActiveFilter('semua')}
            >
              Semua ({PROSPECTS.length})
            </button>
            <button
              type="button"
              className={`${styles.pillBtn} ${activeFilter === 'baru' ? styles.pillActive : ''}`}
              onClick={() => setActiveFilter('baru')}
            >
              Baru (1)
            </button>
            <ArrowRight size={14} className={styles.pillArrow} />
            <button
              type="button"
              className={`${styles.pillBtn} ${activeFilter === 'dihubungi' ? styles.pillActive : ''}`}
              onClick={() => setActiveFilter('dihubungi')}
            >
              Dihubungi (1)
            </button>
            <ArrowRight size={14} className={styles.pillArrow} />
            <button
              type="button"
              className={`${styles.pillBtn} ${activeFilter === 'tertarik' ? styles.pillActive : ''}`}
              onClick={() => setActiveFilter('tertarik')}
            >
              Tertarik (1)
            </button>
            <ArrowRight size={14} className={styles.pillArrow} />
            <button
              type="button"
              className={`${styles.pillBtn} ${activeFilter === 'closing' ? styles.pillActiveClosing : ''}`}
              onClick={() => setActiveFilter('closing')}
            >
              Closing (1)
            </button>
          </div>
        </ScrollReveal>

        {/* Right: Prospect Dashboard Table Preview */}
        <ScrollReveal as="div" className={styles.tableWrapper} animation="scale-up" delay={120}>
          <div className={styles.tableCard}>
            {/* Header */}
            <div className={styles.tableHeader}>
              <div className={styles.titleGroup}>
                <h3 className={styles.tableTitle}>Prospek</h3>
                <span className={styles.tableCaption}>
                  {activeFilter === 'semua' ? 'Menampilkan semua prospek' : `Filter: ${activeFilter.toUpperCase()}`} • 48 calon jamaah
                </span>
              </div>
              <button
                type="button"
                className={styles.addBtn}
                onClick={handleAddProspectClick}
              >
                <Plus size={15} />
                <span>Tambah prospek</span>
              </button>
            </div>

            {/* Interactive Feedback Banner */}
            {showToast && (
              <div className={styles.toastBanner}>
                <span>Alur Otomatis: Prospek dari form web agen langsung tersinkron ke dashboard & notifikasi WhatsApp tim travel!</span>
              </div>
            )}

            {/* Filters */}
            <div className={styles.filtersRow}>
              <div
                className={`${styles.filterBtn} ${activeFilter !== 'semua' ? styles.filterBtnActive : ''}`}
                onClick={() => setActiveFilter('semua')}
              >
                <span>Filter: {activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)}</span>
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
                  {filteredProspects.map((row, idx) => (
                    <tr key={idx} className={styles.tableRowAnimated}>
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
        </ScrollReveal>
      </div>
    </section>
  );
};
