// Agen: the travel's agent network — performance list, registration queue, and one page per agent.
// Pencairan komisi has its own menu (/payouts, split out 1 Oct 2026).
import React, { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { fetchDashboardAgents } from '../../services/api';
import { RouteTabs } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { AgentList } from './AgentList';
import { AgentDetail } from './AgentDetail';
import { Registrations } from './Registrations';
import { Payouts } from './Payouts';
import './agents.css';

const useRefresh = () => {
  const frame = useFrame();
  return useCallback(() => frame?.refreshBadges(), [frame]);
};

const AgentTabs: React.FC = () => {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    fetchDashboardAgents('pending')
      .then((a) => setPending(a.length))
      .catch(() => {});
  }, []);
  return (
    <RouteTabs
      label="Bagian agen"
      items={[
        { to: '/agents', label: 'Agen' },
        { to: '/agents/pending', label: 'Pendaftaran', count: pending, alert: true },
      ]}
    />
  );
};

export const AgentsScreen: React.FC = () => {
  const refresh = useRefresh();
  const [key, setKey] = useState(0);
  const changed = () => {
    refresh();
    setKey((k) => k + 1);
  };
  return (
    <div className="ag">
      <Routes>
        <Route
          index
          element={
            <>
              <AgentTabs key={key} />
              <AgentList />
            </>
          }
        />
        <Route
          path="pending"
          element={
            <>
              <AgentTabs key={key} />
              <Registrations onChanged={changed} />
            </>
          }
        />
        <Route path=":id" element={<AgentDetail onChanged={refresh} />} />
      </Routes>
    </div>
  );
};

export const PayoutsScreen: React.FC = () => {
  const refresh = useRefresh();
  return (
    <div className="ag">
      <Payouts onChanged={refresh} />
    </div>
  );
};
