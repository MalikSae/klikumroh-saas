// "Panduan memulai": the onboarding checklist on Beranda, in three stages (founder decision 7 Oct 2026):
// website ready for jamaah, ready to recruit agents, more jamaah. The stage being worked on is open, the
// others fold to one line; the order is a suggestion, not a gate. Each step has one button that does the
// step right there or opens the exact page for it.
import React, { useState } from 'react';
import { ChevronDown, CircleCheck } from 'lucide-react';
import { Button, Card, Meter } from '../../ui';

export interface SetupStep {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  action: React.ReactNode;
}

export interface SetupStage {
  key: string;
  title: string;
  steps: SetupStep[];
}

const countDone = (steps: SetupStep[]) => steps.filter((s) => s.done).length;

/** The stage to work on: the first one with an open step. */
const currentStage = (stages: SetupStage[]) => stages.find((st) => countDone(st.steps) < st.steps.length) ?? null;

export const SetupChecklist: React.FC<{ stages: SetupStage[]; onHide: () => void }> = ({ stages, onHide }) => {
  const active = currentStage(stages);
  const [open, setOpen] = useState<string | null>(active?.key ?? null);
  const done = stages.reduce((n, st) => n + countDone(st.steps), 0);
  const total = stages.reduce((n, st) => n + st.steps.length, 0);

  return (
    <Card
      title="Panduan memulai"
      className="db2-setup"
      actions={
        <Button size="sm" variant="ghost" onClick={onHide}>
          Sembunyikan
        </Button>
      }
    >
      <div className="db2-setup__progress">
        <Meter value={(done / total) * 100} label={`${done} dari ${total} langkah selesai`} />
        <span>
          {done} dari {total} selesai
        </span>
      </div>
      {stages.map((st, i) => {
        const stDone = countDone(st.steps);
        const expanded = open === st.key;
        const complete = stDone === st.steps.length;
        return (
          <section key={st.key} className={`db2-stage${expanded ? ' db2-stage--open' : ''}`}>
            <button type="button" className="db2-stage__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : st.key)}>
              <span className={`db2-stage__num${complete ? ' db2-stage__num--done' : ''}`} aria-hidden="true">
                {complete ? <CircleCheck className="ku-icon" /> : i + 1}
              </span>
              <span className="db2-stage__title">
                <strong>{st.title}</strong>
                <span>
                  Tahap {i + 1} · {stDone}/{st.steps.length}
                  {st.key === active?.key && !expanded ? ' · sedang berjalan' : ''}
                </span>
              </span>
              <ChevronDown className="ku-icon--sm db2-stage__chev" aria-hidden="true" />
            </button>
            {expanded && (
              <ol className="db2-setup__list">
                {st.steps.map((s) => (
                  <li key={s.key} className={s.done ? 'db2-setup__step db2-setup__step--done' : 'db2-setup__step'}>
                    <span className="db2-setup__mark" aria-hidden="true">
                      {s.done ? <CircleCheck className="ku-icon--sm" /> : <span className="db2-setup__dot" />}
                    </span>
                    <div className="db2-setup__text">
                      <strong>{s.title}</strong>
                      <span>{s.done ? 'Selesai' : s.hint}</span>
                    </div>
                    {!s.done && s.action && <div className="db2-setup__action">{s.action}</div>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </Card>
  );
};
