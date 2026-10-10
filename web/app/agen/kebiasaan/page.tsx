'use client';

// Agent habit tracker: today's five habits (checked automatically from the agent's actions), the streak and
// the last 30 days, plus the streak badges (7, 30, 100 days). Drill-down page from the home card: back button, no bottom tab bar.
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Award, CheckCircle2, Circle, Flame, ChevronRight } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentPage } from '../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../components/agent/AgentPageHeader';
import { HABIT_BADGE_MILESTONES, HabitBadge } from '../../../components/HabitBadge';
import { HABITS, fetchHabitSummary, habitHeadline, type HabitSummary } from '../../../lib/agentHabits';
import './Kebiasaan.css';

const formatBadgeDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

export default function KebiasaanPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<HabitSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('agent_token')) {
      router.push('/agen/login');
      return;
    }
    fetchHabitSummary().then((s) => {
      if (s) setSummary(s);
      else setFailed(true);
    });
  }, [router]);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/agen/dashboard');
  };

  const doneCount = summary?.done_today.length ?? 0;

  return (
    <MobileContainer>
      <AgentPageHeader title="Syiar harian" onBack={goBack} />

      <AgentPage>
        {!summary ? (
          <p className="kb-muted kb-state">{failed ? 'Gagal memuat kebiasaan. Coba buka lagi sebentar.' : 'Memuat kebiasaan...'}</p>
        ) : (
          <>
            {/* Streak hero: game-like brand card (as the leaderboard podium). Big streak number with a glowing
                flame, today's motivating line, and the bar towards the next badge. */}
            <section className="kb-hero" aria-label="Streak istiqamah">
              <div className="kb-hero__top">
                <Flame size={40} className="kb-hero__flame" aria-hidden="true" />
                {/* A big "0" discourages: before the first active day it reads as a start, not a score. */}
                {summary.streak > 0 ? (
                  <span className="kb-hero__count">
                    <b>{summary.streak}</b>
                    <span>hari istiqamah</span>
                  </span>
                ) : (
                  <span className="kb-hero__count kb-hero__count--start">Mulai hari ini</span>
                )}
              </div>
              <p className="kb-hero__cheer">{habitHeadline(summary).title}</p>
              {summary.next_badge > 0 ? (
                <div className="kb-hero__goal">
                  <div
                    className="kb-hero__bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={summary.next_badge}
                    aria-valuenow={Math.min(summary.streak, summary.next_badge)}
                    aria-label={`Menuju lencana ${summary.next_badge} hari`}
                  >
                    <span style={{ width: `${Math.min(100, Math.round((summary.streak / summary.next_badge) * 100))}%` }} />
                  </div>
                  <span className="kb-hero__goal-text">
                    <Award size={16} aria-hidden="true" />
                    {Math.max(summary.next_badge - summary.streak, 1)} hari lagi menuju lencana {summary.next_badge} hari
                  </span>
                </div>
              ) : (
                <p className="kb-hero__goal-text">
                  <Award size={16} aria-hidden="true" />
                  Semua lencana istiqamah sudah diraih
                </p>
              )}
            </section>

            {/* Streak badges: earned ones in their medal color with the date, the rest locked. */}
            <section className="kb-panel" aria-labelledby="kb-badges">
              <h2 id="kb-badges" className="kb-title">
                Lencana istiqamah
              </h2>
              <ul className="kb-badges">
                {HABIT_BADGE_MILESTONES.map((m) => {
                  const earned = (summary.badges || []).find((b) => b.days === m);
                  return (
                    <li key={m} className={`kb-badge${earned ? '' : ' kb-badge--locked'}`}>
                      {earned ? (
                        <HabitBadge days={m} variant="icon" size={28} />
                      ) : (
                        <Award size={28} className="kb-badge__locked-icon" aria-hidden="true" />
                      )}
                      <span className="kb-badge__name">{m} hari</span>
                      <span className="kb-muted">
                        {earned
                          ? `Diraih ${formatBadgeDate(earned.achieved_at)}`
                          : m === summary.next_badge
                            ? `${Math.max(m - summary.streak, 1)} hari lagi`
                            : 'Terkunci'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* How it works: shown until the agent has a first active day. */}
            {summary.best_streak === 0 && (
              <section className="kb-howto" aria-labelledby="kb-howto">
                <h2 id="kb-howto" className="kb-title">
                  Cara main
                </h2>
                <ol className="kb-howto__list">
                  <li>Kerjakan langkah syiar seperti biasa di portal. Tercentang sendiri, tanpa centang manual.</li>
                  <li>
                    Selesaikan minimal {summary.active_min} dari {summary.total} langkah sehari agar hari itu aktif.
                  </li>
                  <li>Hari aktif berturut-turut jadi streak. Satu hari terlewat, streak mulai lagi dari awal.</li>
                </ol>
              </section>
            )}

            {/* Today's checklist */}
            <section className="kb-panel" aria-labelledby="kb-today">
              <div className="kb-panel__head">
                <h2 id="kb-today" className="kb-title">
                  Hari ini
                </h2>
                <span className="kb-count">
                  {doneCount}/{summary.total}
                </span>
              </div>
              <ul className="kb-list">
                {HABITS.map((h) => {
                  const done = summary.done_today.includes(h.key);
                  return (
                    <li key={h.key}>
                      {/* The whole row opens the page where this step is done (finished steps are not links). */}
                      {(() => {
                        const inner = (
                          <>
                            <span className="kb-row__mark" aria-hidden="true">
                              {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                            </span>
                            <span className="kb-row__text">
                              <span className="kb-row__label">{h.label}</span>
                              <span className="kb-muted">{done ? 'Selesai hari ini' : h.hint}</span>
                            </span>
                            {!done && <ChevronRight size={20} className="kb-row__go" aria-hidden="true" />}
                          </>
                        );
                        return done ? (
                          <div className="kb-row kb-row--done">{inner}</div>
                        ) : (
                          <Link href={h.href} className="kb-row" aria-label={`${h.label}. ${h.hint}`}>
                            {inner}
                          </Link>
                        );
                      })()}
                    </li>
                  );
                })}
              </ul>
              <p className="kb-muted">
                Hari aktif: minimal {summary.active_min} dari {summary.total} langkah.
              </p>
            </section>

            {/* Last 30 days */}
            <section className="kb-panel" aria-labelledby="kb-month">
              <div className="kb-panel__head">
                <h2 id="kb-month" className="kb-title">
                  30 hari terakhir
                </h2>
                <span className="kb-count">{summary.calendar.filter((d) => d.active).length} hari aktif</span>
              </div>
              <ol className="kb-cal">
                {summary.calendar.map((d) => (
                  <li
                    key={d.date}
                    className={`kb-cal__day${d.active ? ' kb-cal__day--active' : d.done > 0 ? ' kb-cal__day--some' : ''}${d.date === summary.today ? ' kb-cal__day--today' : ''}`}
                    title={`${dayLabel(d.date)}: ${d.done} dari ${summary.total}`}
                    aria-label={`${dayLabel(d.date)}: ${d.done} dari ${summary.total} kebiasaan${d.active ? ', aktif' : ''}`}
                  />
                ))}
              </ol>
              <p className="kb-legend" aria-hidden="true">
                <span className="kb-legend__item">
                  <span className="kb-cal__day kb-cal__day--active" /> Aktif
                </span>
                <span className="kb-legend__item">
                  <span className="kb-cal__day kb-cal__day--some" /> Sebagian
                </span>
                <span className="kb-legend__item">
                  <span className="kb-cal__day" /> Kosong
                </span>
              </p>
            </section>
          </>
        )}
      </AgentPage>
    </MobileContainer>
  );
}
