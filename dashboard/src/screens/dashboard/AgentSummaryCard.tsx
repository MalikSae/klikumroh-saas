// Agent block on the dashboard home (3 Oct 2026, compacted 6 Oct 2026). Three counts that tell how alive
// the agent network is, with the founder's definitions, plus the three most productive agents of the last
// 30 days:
//   terdaftar - approved agents with status active
//   aktif     - routine daily syiar: at least N active days in the last 7 days
//   produktif - brought in a prospect or a closing jamaah in the last 30 days
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Award } from 'lucide-react';
import { fetchAgentInsight, getFullImageUrl, type AgentInsight } from '../../services/api';
import { Avatar, Button, Card, EmptyState, RowLink, fmtNumber } from '../../ui';

const badgeTier = (days: number) => (days >= 100 ? 'gold' : days >= 30 ? 'silver' : 'bronze');
// One key message when the counts are out of balance (what the owner should act on), else nothing.
const insight = (d: AgentInsight): string | null => {
  if (d.registered === 0) return null;
  if (d.active_7d === 0) return 'Belum ada agen yang rutin syiar minggu ini. Ajak agen membuka Syiar harian di portal agen.';
  if (d.productive_30d === 0) return 'Belum ada agen yang membawa prospek dalam 30 hari terakhir.';
  const idle = d.registered - d.productive_30d;
  if (idle > d.registered / 2) return `${idle} dari ${d.registered} agen belum membawa hasil dalam 30 hari terakhir.`;
  return null;
};

export const AgentSummaryCard: React.FC = () => {
  const [data, setData] = useState<AgentInsight | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAgentInsight()
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const message = data ? insight(data) : null;

  return (
    <Card title="Agen" actions={<Button size="sm" to="/agents">Lihat semua</Button>} className="db2-agents">
      {failed ? (
        <div className="ku-card__body">
          <p className="ku-muted">Ringkasan agen belum bisa dimuat.</p>
        </div>
      ) : !data ? (
        <div className="db2-list-skeleton" />
      ) : (
        <>
          {/* Three counts in a row split by hairlines, no inner box (VISION rule 2: never a card in a card). */}
          <dl className="db2-agents__counts">
            <div title="Agen yang sudah disetujui dan statusnya aktif">
              <dt>Terdaftar</dt>
              <dd>{fmtNumber(data.registered)}</dd>
            </div>
            <div title={`Aktif dalam 7 hari terakhir: minimal ${data.routine_min_days} hari syiar`}>
              <dt>Aktif</dt>
              <dd>{fmtNumber(data.active_7d)}</dd>
            </div>
            <div title="Produktif: membawa prospek atau closing dalam 30 hari">
              <dt>Produktif</dt>
              <dd>{fmtNumber(data.productive_30d)}</dd>
            </div>
          </dl>
          {message && (
            <p className="db2-agents__insight">
              <AlertTriangle className="ku-icon--sm" aria-hidden="true" />
              {message}
            </p>
          )}
          <h3 className="db2-agents__sub">Paling produktif 30 hari</h3>
          {data.top.length === 0 ? (
            <EmptyState compact title="Belum ada agen produktif" description="Agen yang membawa prospek atau closing dalam 30 hari terakhir tampil di sini." />
          ) : (
            <ul className="ku-rowlist db2-agents__list">
              {data.top.slice(0, 3).map((a) => (
                <RowLink
                  key={a.agent_id}
                  to={`/agents/${a.agent_id}`}
                  lead={<Avatar name={a.name} src={a.photo_url ? getFullImageUrl(a.photo_url) : null} />}
                  title={
                    <>
                      {a.name}
                      {a.top_badge > 0 && <Award className={`ku-icon--sm ag-habit__medal ag-habit__medal--${badgeTier(a.top_badge)}`} aria-label={`Lencana ${a.top_badge} hari`} />}
                    </>
                  }
                  meta={
                    <span>
                      {fmtNumber(a.prospects_30d)} prospek · <b className="db2-agents__jamaah">{fmtNumber(a.jamaah_30d)} jamaah</b>
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
};
