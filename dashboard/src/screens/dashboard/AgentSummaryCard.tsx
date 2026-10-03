// Agent block on the dashboard home (3 Oct 2026). Three counts that tell how alive the agent network is,
// with the founder's definitions, plus the five most productive agents of the last 30 days:
//   terdaftar - approved agents with status active
//   aktif     - routine daily syiar: at least N active days in the last 7 days
//   produktif - brought in a prospect or a closing jamaah in the last 30 days
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award } from 'lucide-react';
import { fetchAgentInsight, getFullImageUrl, type AgentInsight } from '../../services/api';
import { Avatar, Button, Card, EmptyState, fmtNumber } from '../../ui';

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
  const navigate = useNavigate();
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

  return (
    <Card title="Agen" actions={<Button size="sm" to="/agents">Lihat semua</Button>} className="db2-agents">
      {failed ? (
        <div className="ku-card__body">
          <p className="ku-muted">Ringkasan agen belum bisa dimuat.</p>
        </div>
      ) : !data ? (
        <div className="db2-agents__skeleton" />
      ) : (
        <div className="db2-agents__body">
          <div className="db2-agents__left">
          <dl className="db2-agents__counts">
            <div>
              <dt>Terdaftar</dt>
              <dd>{fmtNumber(data.registered)}</dd>
              <span title="Agen yang sudah disetujui dan statusnya aktif">Disetujui</span>
            </div>
            <div>
              <dt>Aktif</dt>
              <dd>{fmtNumber(data.active_7d)}</dd>
              <span title={`Minimal ${data.routine_min_days} hari aktif syiar harian dalam 7 hari terakhir`}>Rutin syiar 7 hari</span>
            </div>
            <div>
              <dt>Produktif</dt>
              <dd>{fmtNumber(data.productive_30d)}</dd>
              <span title="Membawa prospek atau jamaah closing dalam 30 hari terakhir">Ada hasil 30 hari</span>
            </div>
          </dl>
          {insight(data) && <p className="db2-agents__insight">{insight(data)}</p>}
          </div>

          <div className="db2-agents__top">
            <h3 className="db2-agents__sub">Paling produktif 30 hari</h3>
            {data.top.length === 0 ? (
              <EmptyState compact title="Belum ada agen produktif" description="Agen yang membawa prospek atau closing dalam 30 hari terakhir tampil di sini." />
            ) : (
              <ol className="db2-agents__list">
                {data.top.map((a) => (
                  <li key={a.agent_id}>
                    <button type="button" className="db2-agents__row" onClick={() => navigate(`/agents/${a.agent_id}`)}>
                      <Avatar name={a.name} src={a.photo_url ? getFullImageUrl(a.photo_url) : null} />
                      <span className="db2-agents__name">
                        {a.name}
                        {a.top_badge > 0 && (
                          <Award className={`ku-icon--sm ag-habit__medal ag-habit__medal--${badgeTier(a.top_badge)}`} aria-label={`Lencana ${a.top_badge} hari`} />
                        )}
                      </span>
                      <span className="db2-agents__nums">
                        {fmtNumber(a.prospects_30d)} prospek · <b>{fmtNumber(a.jamaah_30d)} jamaah</b>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
