// Network KPIs at the top of the Agen section (above the Agen / Pendaftaran tabs). Same numbers and
// definitions as the agent card on the dashboard home (GET /api/dashboard/agent-summary).
import React, { useEffect, useState } from 'react';
import { Flame, Handshake, TrendingUp, Users } from 'lucide-react';
import { fetchAgentInsight, type AgentInsight } from '../../services/api';
import { KpiCard, fmtNumber } from '../../ui';

export const AgentKpis: React.FC = () => {
  const [insight, setInsight] = useState<AgentInsight | null>(null);
  useEffect(() => {
    fetchAgentInsight()
      .then(setInsight)
      .catch(() => setInsight(null));
  }, []);
  return (
    <div className="ku-kpi-row">
      <KpiCard label="Terdaftar" icon={<Users className="ku-icon" />} value={insight ? fmtNumber(insight.registered) : '—'} note="Agen disetujui dan aktif" />
      <KpiCard label="Aktif" icon={<Flame className="ku-icon" />} value={insight ? fmtNumber(insight.active_7d) : '—'} note={insight ? `Rutin syiar, minimal ${insight.routine_min_days} dari 7 hari` : undefined} />
      <KpiCard label="Produktif" icon={<TrendingUp className="ku-icon" />} value={insight ? fmtNumber(insight.productive_30d) : '—'} note="Ada prospek atau closing 30 hari" />
      <KpiCard label="Jamaah closing" icon={<Handshake className="ku-icon" />} value={insight ? fmtNumber(insight.jamaah_30d) : '—'} note={insight ? `Dari agen, 30 hari · ${fmtNumber(insight.prospects_30d)} prospek` : undefined} />
    </div>
  );
};
