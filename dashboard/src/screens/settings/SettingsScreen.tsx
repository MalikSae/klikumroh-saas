// Pengaturan: travel profile, subscription & billing, team, staff access history.
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { RouteTabs } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { ProfileSettings } from './ProfileSettings';
import { BillingSettings } from './BillingSettings';
import { InvoiceScreen } from './InvoiceScreen';
import { TeamSettings } from './TeamSettings';
import { AccessLogSettings } from './AccessLogSettings';
import './settings.css';

export const SettingsScreen: React.FC = () => {
  const frame = useFrame();
  const sub = frame?.subscription;
  const billingAlert = Boolean(sub && (sub.status === 'pending' || sub.is_suspended || sub.is_subscription_expired));
  return (
    <div className="st">
      <RouteTabs
        label="Bagian pengaturan"
        items={[
          { to: '/settings', label: 'Profil travel' },
          { to: '/settings/subscription', prefix: true, label: 'Langganan', count: billingAlert ? 1 : undefined, alert: true },
          { to: '/settings/team', label: 'Tim' },
          { to: '/settings/access-log', label: 'Riwayat akses staf' },
        ]}
      />
      <Routes>
        <Route index element={<ProfileSettings />} />
        <Route path="subscription" element={<BillingSettings />} />
        <Route path="subscription/payment/:id" element={<InvoiceScreen />} />
        <Route path="team" element={<TeamSettings />} />
        <Route path="access-log" element={<AccessLogSettings />} />
      </Routes>
    </div>
  );
};
