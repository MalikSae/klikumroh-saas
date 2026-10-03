// "Syiar harian" panel on the agent detail page: the same habit tracker the agent sees in the portal
// (streak, badges, 30-day calendar) plus how often each habit was done, so the travel can coach the agent
// ("shares a lot, rarely follows up"). Read only, no reminders (CRM automation is a non-goal).
import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { fetchAgentHabitReport, type AgentHabitReport } from '../../services/api';
import { CardBody, fmtDate } from '../../ui';

// Same five habits and labels as the agent portal (web/lib/agentHabits.ts).
const HABITS: { key: string; label: string }[] = [
  { key: 'share', label: 'Bagikan link atau paket' },
  { key: 'contact', label: 'Hubungi calon jamaah' },
  { key: 'caption', label: 'Posting caption atau status WA' },
  { key: 'note', label: 'Catat perkembangan jamaah' },
  { key: 'sumber', label: 'Coba sumber jamaah baru' },
];

const badgeTier = (days: number) => (days >= 100 ? 'gold' : days >= 30 ? 'silver' : 'bronze');

export const AgentHabits: React.FC<{ agentId: number }> = ({ agentId }) => {
  const [report, setReport] = useState<AgentHabitReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAgentHabitReport(agentId)
      .then((r) => alive && setReport(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [agentId]);

  if (failed)
    return (
      <CardBody>
        <p className="ku-muted">Syiar harian belum bisa dimuat.</p>
      </CardBody>
    );
  if (!report)
    return (
      <CardBody>
        <div className="ag-loading ag-loading--sm" aria-busy="true" />
      </CardBody>
    );

  const top = report.badges.length > 0 ? Math.max(...report.badges.map((b) => b.days)) : 0;
  const max = Math.max(1, ...HABITS.map((h) => report.counts_30[h.key] ?? 0));

  return (
    <>
      <div className="ag-stats">
        <div>
          <span>Streak sekarang</span>
          <b>{report.streak} hari</b>
        </div>
        <div>
          <span>Streak terbaik</span>
          <b>{report.best_streak} hari</b>
        </div>
        <div>
          <span>Hari aktif 30 hari</span>
          <b>{report.active_days_30}/30</b>
        </div>
        <div>
          <span>Lencana</span>
          <b className="ag-habit__badge">
            {top > 0 ? (
              <>
                <Award className={`ku-icon--sm ag-habit__medal ag-habit__medal--${badgeTier(top)}`} aria-hidden="true" />
                {top} hari
              </>
            ) : (
              'Belum ada'
            )}
          </b>
        </div>
      </div>

      <div className="ku-card__body ag-habit__grid">
        <div>
          <h4 className="ag-habit__sub">30 hari terakhir</h4>
          <ol className="ag-habit__cal" aria-label="Kalender syiar 30 hari terakhir">
            {report.calendar.map((d) => (
              <li
                key={d.date}
                className={`ag-habit__day${d.active ? ' ag-habit__day--active' : d.done > 0 ? ' ag-habit__day--some' : ''}`}
                title={`${fmtDate(d.date)}: ${d.done}/${report.total} langkah${d.active ? ', aktif' : ''}`}
              />
            ))}
          </ol>
          <p className="ku-muted ag-habit__note">Hari aktif: minimal {report.active_min} dari {report.total} langkah.</p>
        </div>

        <div>
          <h4 className="ag-habit__sub">Langkah dalam 30 hari</h4>
          <ul className="ag-habit__counts">
            {HABITS.map((h) => {
              const n = report.counts_30[h.key] ?? 0;
              return (
                <li key={h.key}>
                  <span className="ag-habit__label">{h.label}</span>
                  <span className="ag-habit__bar" aria-hidden="true">
                    <span style={{ width: `${Math.round((n / max) * 100)}%` }} />
                  </span>
                  <span className="ag-habit__n">{n} hari</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
};
