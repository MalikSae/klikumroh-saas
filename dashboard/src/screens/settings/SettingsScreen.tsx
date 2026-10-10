// Pengaturan: travel profile, agent rules (commission & registration), subscription & billing, team,
// staff access history.
import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RouteTabs } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { ProfileSettings } from './ProfileSettings';
import { BillingSettings } from './BillingSettings';
import { InvoiceScreen } from './InvoiceScreen';
import { TeamSettings } from './TeamSettings';
import { AccessLogSettings } from './AccessLogSettings';
import { Rules } from '../programs/Rules';
import './settings.css';

export const SettingsScreen: React.FC = () => {
  const frame = useFrame();
  const invoiceRoute = useLocation().pathname.startsWith('/settings/subscription/payment/');
  const sub = frame?.subscription;
  // Subscription and billing are for the PIC only; a team admin never sees the tab or its pages.
  const isPic = frame?.isPic ?? true;
  const billingAlert = Boolean(sub && (sub.status === 'pending' || sub.is_suspended || sub.is_subscription_expired));
  return (
    <div className="st">
      {!invoiceRoute && <RouteTabs
        label="Bagian pengaturan"
        items={[
          { to: '/settings', label: 'Profil travel' },
          { to: '/settings/agent-rules', label: 'Aturan agen' },
          ...(isPic ? [{ to: '/settings/subscription', prefix: true, label: 'Langganan', count: billingAlert ? 1 : undefined, alert: true }] : []),
          { to: '/settings/team', label: 'Tim' },
          { to: '/settings/access-log', label: 'Riwayat akses staf' },
        ]}
      />}
      <Routes>
        <Route index element={<ProfileSettings />} />
        <Route path="agent-rules" element={<Rules />} />
        <Route path="subscription" element={isPic ? <BillingSettings /> : <Navigate to="/settings" replace />} />
        <Route path="subscription/payment/:id" element={isPic ? <InvoiceScreen /> : <Navigate to="/settings" replace />} />
        <Route path="team" element={<TeamSettings />} />
        <Route path="access-log" element={<AccessLogSettings />} />
      </Routes>
    </div>
  );
};
