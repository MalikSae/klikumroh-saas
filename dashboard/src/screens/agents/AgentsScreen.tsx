// Agen: the travel's agent network — performance list, registration queue, payout queue.
import React, { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { fetchDashboardAgents, fetchPayoutRequests } from '../../services/api';
import { RouteTabs } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { AgentList } from './AgentList';
import { Registrations } from './Registrations';
import { Payouts } from './Payouts';
import './agents.css';

export const AgentsScreen: React.FC = () => {
  const frame = useFrame();
  const [counts, setCounts] = useState({ pending: 0, payouts: 0 });

  const refresh = useCallback(() => {
    Promise.all([fetchDashboardAgents('pending').catch(() => []), fetchPayoutRequests('pending').catch(() => [])]).then(([a, p]) =>
      setCounts({ pending: a.length, payouts: p.length }),
    );
    frame?.refreshBadges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="ag">
      <RouteTabs
        label="Bagian agen"
        items={[
          { to: '/agents', label: 'Agen' },
          { to: '/agents/pending', label: 'Pendaftaran', count: counts.pending, alert: true },
          { to: '/agents/payouts', label: 'Pencairan komisi', count: counts.payouts, alert: true },
        ]}
      />
      <Routes>
        <Route index element={<AgentList onChanged={refresh} />} />
        <Route path="pending" element={<Registrations onChanged={refresh} />} />
        <Route path="payouts" element={<Payouts onChanged={refresh} />} />
        <Route path=":id" element={<AgentList onChanged={refresh} />} />
      </Routes>
    </div>
  );
};
