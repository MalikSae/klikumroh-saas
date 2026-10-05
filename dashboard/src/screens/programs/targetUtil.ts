import type { AgentTarget } from '../../services/api';
import type { PillTone } from '../../ui';
import { todayWIB } from '../../utils/datetime';

export const METRIC_LABEL: Record<AgentTarget['metric_type'], string> = {
  closing_pax: 'Jamaah closing',
  mitra_baru_count: 'Agen baru direkrut',
};

export const METRIC_UNIT: Record<AgentTarget['metric_type'], string> = {
  closing_pax: 'jamaah',
  mitra_baru_count: 'agen',
};

// WIB calendar date: toISOString() is UTC and still shows yesterday until 07:00 WIB.
const today = () => todayWIB();

export function targetState(t: AgentTarget): { key: 'upcoming' | 'running' | 'ended' | 'closed'; label: string; tone: PillTone } {
  if (t.status === 'closed') return { key: 'closed', label: 'Ditutup', tone: 'gray' };
  const d = today();
  if (d < t.period_start.slice(0, 10)) return { key: 'upcoming', label: 'Belum mulai', tone: 'gray' };
  if (d > t.period_end.slice(0, 10)) return { key: 'ended', label: 'Perlu ditutup', tone: 'amber' };
  return { key: 'running', label: 'Berjalan', tone: 'blue' };
}

const fmtDay = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export const periodText = (t: AgentTarget) => `${fmtDay(t.period_start)} – ${fmtDay(t.period_end)}`;

export const targetName = (t: AgentTarget) => t.title?.trim() || `${t.metric_value} ${METRIC_UNIT[t.metric_type]} ${t.metric_type === 'closing_pax' ? 'closing' : 'baru'}`;
