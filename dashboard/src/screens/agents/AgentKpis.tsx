// Network KPIs at the top of the Agen section (above the Agen / Pendaftaran tabs). Same numbers and
// definitions as the agent card on the dashboard home (GET /api/dashboard/agent-summary). One metric strip,
// like Beranda: short label and note on one line each, the full definition in the tooltip.
import React, { useEffect, useState } from 'react';
import { fetchAgentInsight, type AgentInsight } from '../../services/api';
import { Metric, MetricStrip, fmtNumber } from '../../ui';

export const AgentKpis: React.FC = () => {
  const [insight, setInsight] = useState<AgentInsight | null>(null);
  useEffect(() => {
    fetchAgentInsight()
      .then(setInsight)
      .catch(() => setInsight(null));
  }, []);
  return (
    <MetricStrip label="Jaringan agen">
      <Metric label="Terdaftar" value={insight ? fmtNumber(insight.registered) : '—'} note="agen disetujui" hint="Agen yang sudah disetujui dan statusnya aktif" />
      <Metric
        label="Aktif"
        value={insight ? fmtNumber(insight.active_7d) : '—'}
        note="7 hari terakhir"
        hint={insight ? `Aktif dalam 7 hari terakhir: minimal ${insight.routine_min_days} hari syiar` : undefined}
      />
      <Metric label="Produktif" value={insight ? fmtNumber(insight.productive_30d) : '—'} note="30 hari terakhir" hint="Produktif: membawa prospek atau closing dalam 30 hari" />
      <Metric
        label="Jamaah closing"
        value={insight ? fmtNumber(insight.jamaah_30d) : '—'}
        note={insight ? `30 hari · ${fmtNumber(insight.prospects_30d)} prospek` : undefined}
        hint={insight ? `Jamaah closing dari agen dalam 30 hari terakhir, dari ${fmtNumber(insight.prospects_30d)} prospek agen` : undefined}
      />
    </MetricStrip>
  );
};
