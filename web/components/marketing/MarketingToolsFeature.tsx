'use client';

import React, { useState } from 'react';
import { MessageCircle, Copy, Check, BookOpen, Users, Target, GitBranch } from 'lucide-react';
import styles from './MarketingToolsFeature.module.css';

const TOOL_CARDS = [
  {
    badge: '152 copy',
    icon: BookOpen,
    title: 'Bank caption',
    desc: 'Copy promosi untuk menarik perhatian, memberi edukasi, membangun kepercayaan, dan menawarkan paket.',
  },
  {
    badge: '99 sumber',
    icon: Users,
    title: 'Sumber jamaah',
    desc: '99 ide dari 11 kelompok relasi, lengkap dengan alasan, cara memulai, dan contoh pendekatan.',
  },
  {
    badge: '5 tujuan konten',
    icon: Target,
    title: 'Panduan promosi',
    desc: 'Pilih konten sesuai tujuan: menarik perhatian, edukasi, membangun minat, kepercayaan, atau menawarkan paket.',
  },
  {
    badge: '6 tahap',
    icon: GitBranch,
    title: 'Alur percakapan',
    desc: 'Greeting, identifikasi kebutuhan, penawaran, menangani keberatan, closing, dan follow-up tersusun runtut.',
  },
];

export const MarketingToolsFeature: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(
      'Wajar sekali, Bu. Boleh saya bantu bandingkan fasilitas hotel dan jaraknya supaya Ibu bisa menilai paketnya dengan lebih utuh?'
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        {/* Heading */}
        <div className={styles.headingRow}>
          <div className={styles.headingCopy}>
            <span className={styles.eyebrow}>03  —  TOOLS MARKETING AGEN</span>
            <h2 className={styles.headline}>
              Agen langsung punya bekal untuk mencari, menghubungi, dan menindaklanjuti jamaah.
            </h2>
          </div>
          <p className={styles.intro}>
            KlikUmroh sudah menyiapkan semuanya. Agen tinggal pilih, sesuaikan, lalu gunakan dari HP.
          </p>
        </div>

        {/* Showcase Grid */}
        <div className={styles.showcaseGrid}>
          {/* Left: Script WhatsApp Showcase */}
          <div className={styles.scriptCard}>
            <div className={styles.scriptHeader}>
              <div className={styles.scriptTitleGroup}>
                <span className={styles.scriptBadge}>213 SCRIPT WHATSAPP • 6 TAHAP</span>
                <h3 className={styles.scriptTitle}>Panduan chat untuk setiap tahap penjualan</h3>
              </div>
              <div className={styles.scriptIconBox}>
                <MessageCircle size={22} className={styles.scriptHeaderIcon} />
              </div>
            </div>

            <div className={styles.chatFlow}>
              {/* Question bubble */}
              <div className={styles.questionBubble}>
                <span className={styles.bubbleLabelMuted}>CALON JAMAAH</span>
                <p className={styles.bubbleText}>
                  “Harganya agak lebih tinggi dari travel sebelah ya?”
                </p>
              </div>

              {/* Answer bubble */}
              <div className={styles.answerBubble}>
                <span className={styles.bubbleLabelActive}>SARAN JAWABAN</span>
                <p className={styles.bubbleText}>
                  “Wajar sekali, Bu. Boleh saya bantu bandingkan fasilitas hotel dan jaraknya supaya Ibu bisa menilai paketnya dengan lebih utuh?”
                </p>
              </div>
            </div>

            <button type="button" className={styles.copyBtn} onClick={handleCopy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Jawaban tersalin' : 'Salin jawaban'}</span>
            </button>
          </div>

          {/* Right: 4 Marketing Tool Cards */}
          <div className={styles.toolsGrid}>
            {TOOL_CARDS.map((card, idx) => {
              const IconComp = card.icon;
              return (
                <div key={idx} className={styles.toolCard}>
                  <div className={styles.toolCardTop}>
                    <div className={styles.toolIconBox}>
                      <IconComp size={18} className={styles.toolIcon} />
                    </div>
                    <span className={styles.toolBadge}>{card.badge}</span>
                  </div>
                  <h4 className={styles.toolTitle}>{card.title}</h4>
                  <p className={styles.toolDesc}>{card.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
