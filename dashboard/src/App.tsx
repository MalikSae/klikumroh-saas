import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardScreen } from './screens/dashboard/DashboardScreen';
import { AppFrame } from './app/AppFrame';
import { RequireAuth } from './app/RequireAuth';
import { ProspectsScreen } from './screens/prospects/ProspectsScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { AgentsScreen, PayoutsScreen } from './screens/agents/AgentsScreen';
import { ProgramsScreen } from './screens/programs/ProgramsScreen';
import { PlaybookScreen } from './screens/playbook/PlaybookScreen';
import { PackagesScreen } from './screens/packages/PackagesScreen';
import { ChannelsScreen } from './screens/channels/ChannelsScreen';
import { TrackingScreen } from './screens/channels/TrackingScreen';
import { WebsiteScreen } from './screens/website/WebsiteScreen';
import { AccountScreen } from './screens/settings/AccountScreen';

import {
  AdminLoginView,
  AdminDashboardView,
  AdminTenantsView,
  AdminTenantDetailView,
  AdminPaymentsView,
  AdminPlansView,
  AdminCouponsView,
  AdminSettingsView,
  AdminLegalView,
  AdminDemoLeadsView,
  AdminStaffView,
  AdminAffiliatorsView,
  AdminAffiliatorDetailView,
  AdminAuthGuard,
} from './modules/superadmin';
import { webLoginUrl } from './services/api';
import { AffiliatorFrame } from './modules/affiliator/AffiliatorFrame';
import { AffiliatorAuthView } from './modules/affiliator/AffiliatorAuthView';
import { AffiliatorHomeView } from './modules/affiliator/AffiliatorHomeView';
import { AffiliatorTravelsView } from './modules/affiliator/AffiliatorTravelsView';
import { AffiliatorCommissionsView } from './modules/affiliator/AffiliatorCommissionsView';
import { AffiliatorAccountView } from './modules/affiliator/AffiliatorAccountView';


const LoginRedirect: React.FC = () => {
  React.useEffect(() => {
    window.location.href = webLoginUrl();
  }, []);

  return null;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
        <Routes>
        <Route path="/login" element={<LoginRedirect />} />

        {/* Travel admin dashboard — requires a valid session so the
            dashboard always reflects the tenant that just logged in */}
        <Route element={<RequireAuth />}>
          <Route element={<AppFrame />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/prospects" element={<ProspectsScreen />} />
          <Route path="/prospects/:id" element={<ProspectsScreen />} />
          <Route path="/prospects/:id/edit" element={<ProspectsScreen />} />
          <Route path="/packages/*" element={<PackagesScreen />} />
          <Route path="/channels" element={<ChannelsScreen />} />
          {/* Moved to its own menu (1 Oct 2026); old links keep working. */}
          <Route path="/channels/tracking" element={<Navigate to="/tracking" replace />} />
          <Route path="/tracking" element={<TrackingScreen />} />
          {/* Pencairan komisi moved to its own menu (1 Oct 2026); old links keep working. */}
          <Route path="/agents/payouts" element={<Navigate to="/payouts" replace />} />
          <Route path="/agents/*" element={<AgentsScreen />} />
          <Route path="/payouts" element={<PayoutsScreen />} />
          {/* Aturan agen lives in Pengaturan (1 Oct 2026); old links keep working. */}
          <Route path="/programs/rules" element={<Navigate to="/settings/agent-rules" replace />} />
          <Route path="/agent-rules" element={<Navigate to="/settings/agent-rules" replace />} />
          <Route path="/programs/*" element={<ProgramsScreen />} />
          <Route path="/playbook/*" element={<PlaybookScreen />} />
          <Route path="/settings/*" element={<SettingsScreen />} />
          <Route path="/account" element={<AccountScreen />} />
          <Route path="/website/*" element={<WebsiteScreen />} />
          </Route>
        </Route>


        {/* KlikUmroh Master Super Admin Portal */}
        <Route path="/internal/login" element={<AdminLoginView />} />
        <Route element={<AdminAuthGuard />}>
          <Route path="/internal/dashboard" element={<AdminDashboardView />} />
          <Route path="/internal/tenants" element={<AdminTenantsView />} />
          <Route path="/internal/tenants/:id" element={<AdminTenantDetailView />} />
          <Route path="/internal/pricing-plans" element={<AdminPlansView />} />
          <Route path="/internal/legal" element={<AdminLegalView />} />
          <Route path="/internal/demo-leads" element={<AdminDemoLeadsView />} />
          <Route path="/internal/coupons" element={<AdminCouponsView />} />
          <Route path="/internal/payment-verifications" element={<AdminPaymentsView />} />
          <Route path="/internal/staff" element={<AdminStaffView />} />
          <Route path="/internal/affiliators" element={<AdminAffiliatorsView />} />
          <Route path="/internal/affiliators/:id" element={<AdminAffiliatorDetailView />} />
          <Route path="/internal/settings" element={<AdminSettingsView />} />
          <Route path="/internal" element={<Navigate to="/internal/dashboard" replace />} />
        </Route>

        {/* Affiliator KlikUmroh portal (own login and token) */}
        <Route path="/affiliator/login" element={<AffiliatorAuthView mode="login" />} />
        <Route path="/affiliator/daftar" element={<AffiliatorAuthView mode="register" />} />
        <Route element={<AffiliatorFrame />}>
          <Route path="/affiliator" element={<AffiliatorHomeView />} />
          <Route path="/affiliator/travel" element={<AffiliatorTravelsView />} />
          <Route path="/affiliator/komisi" element={<AffiliatorCommissionsView />} />
          <Route path="/affiliator/akun" element={<AffiliatorAccountView />} />
          <Route path="/affiliator/*" element={<Navigate to="/affiliator" replace />} />
        </Route>


        {/* Legacy Alias /staff/* -> /internal/* */}
        <Route path="/staff/login" element={<AdminLoginView />} />
        <Route path="/staff/dashboard" element={<Navigate to="/internal/dashboard" replace />} />
        <Route path="/staff/tenants" element={<Navigate to="/internal/tenants" replace />} />
        <Route path="/staff/pricing-plans" element={<Navigate to="/internal/pricing-plans" replace />} />
        <Route path="/staff/coupons" element={<Navigate to="/internal/coupons" replace />} />
        <Route path="/staff/payment-verifications" element={<Navigate to="/internal/payment-verifications" replace />} />
        <Route path="/staff/staff" element={<Navigate to="/internal/staff" replace />} />
        <Route path="/staff/users" element={<Navigate to="/internal/staff" replace />} />
        <Route path="/staff/settings" element={<Navigate to="/internal/settings" replace />} />
        <Route path="/staff" element={<Navigate to="/internal/dashboard" replace />} />
        <Route path="/staff/*" element={<Navigate to="/internal/login" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
