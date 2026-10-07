// Target & hadiah: every target with its period and how many agents reached it; row opens the target drawer.
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchTargetAchievements, fetchTargetProgress, fetchTargets, type AgentTarget } from '../../services/api';
import { Banner, Button, DataTable, EmptyState, Pill, Toolbar, errorText, type Column } from '../../ui';
import { METRIC_LABEL, periodText, targetName, targetState } from './targetUtil';
import { TargetModal } from './TargetModal';
import { TargetDrawer } from './TargetDrawer';

type Row = AgentTarget & { reached: number | null };

const ORDER = { ended: 0, running: 1, upcoming: 2, closed: 3 } as const;

export const Targets: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const list = await fetchTargets();
      const reached = await Promise.all(
        list.map((t) =>
          // A closed target counts the achievements recorded at closing (as the drawer lists them), not
          // the live progress, which can still change afterwards (e.g. a cancelled closing).
          (t.status === 'closed'
            ? fetchTargetAchievements(t.id).then((a) => a.length)
            : fetchTargetProgress(t.id).then((p) => (p.rows ?? []).filter((r) => r.achieved || r.achieved_value >= t.metric_value).length)
          ).catch(() => null),
        ),
      );
      setRows(
        list
          .map((t, i) => ({ ...t, reached: reached[i] }))
          .sort((a, b) => ORDER[targetState(a).key] - ORDER[targetState(b).key] || b.period_end.localeCompare(a.period_end)),
      );
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Gagal memuat target'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Target',
      cell: (t) => (
        <span className="ag-name">
          {targetName(t)}
          <span className="ku-muted">
            {METRIC_LABEL[t.metric_type]} · minimal {t.metric_value}
          </span>
        </span>
      ),
    },
    { key: 'period', header: 'Periode', cell: (t) => periodText(t) },
    { key: 'reward', header: 'Hadiah', cell: (t) => <span className="pg-reward">{t.reward_description || '—'}</span> },
    { key: 'reached', header: 'Agen tercapai', align: 'right', cell: (t) => (t.reached === null ? '—' : t.reached) },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => {
        const s = targetState(t);
        return <Pill tone={s.tone}>{s.label}</Pill>;
      },
    },
  ];

  const needsClosing = rows.filter((t) => targetState(t).key === 'ended').length;

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      {needsClosing > 0 && (
        <Banner tone="warning">
          <b>{needsClosing} target sudah lewat periodenya.</b> Akhiri target untuk mencatat agen yang berhak mendapat hadiah.
        </Banner>
      )}
      <Toolbar
        right={
          <Button variant="primary" icon={<Plus className="ku-icon--sm" />} onClick={() => setCreating(true)}>
            Buat target
          </Button>
        }
      >
        <span className="ku-muted">Target mendorong agen berjualan dalam periode tertentu. Agen melihat progresnya di dashboard agen.</span>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        onRowClick={(t) => navigate(`/programs/${t.id}`)}
        empty={<EmptyState compact title="Belum ada target" description="Buat target pertama, misalnya 10 jamaah closing bulan ini dengan bonus tunai." />}
      />
      {creating && (
        <TargetModal
          onClose={() => setCreating(false)}
          onSaved={(t) => {
            setCreating(false);
            load();
            navigate(`/programs/${t.id}`);
          }}
        />
      )}
      {id && <TargetDrawer targetId={Number(id)} onClose={() => navigate('/programs')} onChanged={load} />}
    </section>
  );
};
