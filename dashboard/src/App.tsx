import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardOverviewPage } from './pages/DashboardOverview';
import { DevComponentsPage } from './pages/DevComponents';
import { PackagesPage } from './pages/Packages';
import { PackageFormPage } from './pages/PackageFormPage';
import { ProspectsPage } from './pages/Prospects';
import { ProspectDetailPage } from './pages/ProspectDetail';
import { ProspectEditPage } from './pages/ProspectEdit';
import { SettingsPage } from './pages/Settings';
import { SubscriptionCheckoutPage } from './pages/SubscriptionCheckout';
import { SubscriptionPaymentInstructionPage } from './pages/SubscriptionPaymentInstruction';
import { WebsiteContentPage } from './pages/WebsiteContent';
import { AgentsPage } from './pages/Agents';
import { AgentDetailPage } from './pages/AgentDetail';
import { AgentCommissionsPage } from './pages/AgentCommissions';
import { AgentTargetsPage } from './pages/AgentTargets';
import { ProfilSayaPage } from './pages/ProfilSaya';

import {
  AdminLoginView,
  AdminDashboardView,
  AdminTenantsView,
  AdminTenantDetailView,
  AdminPaymentsView,
  AdminPlansView,
  AdminCouponsView,
  AdminSettingsView,
  AdminStaffView,
  AdminAuthGuard,
} from './modules/superadmin';

import { SidebarProvider } from './components/SidebarContext';
import { RequireAuth } from './components/RequireAuth';

const LoginRedirect: React.FC = () => {
  React.useEffect(() => {
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');
    const loginUrl = isLocal ? 'http://localhost:3000/login' : '/login';
    window.location.href = loginUrl;
  }, []);

  return null;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <Routes>
        <Route path="/login" element={<LoginRedirect />} />

        {/* Travel admin dashboard — requires a valid session so the
            dashboard always reflects the tenant that just logged in */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<DashboardOverviewPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/packages/new" element={<PackageFormPage />} />
          <Route path="/packages/:id/edit" element={<PackageFormPage />} />
          <Route path="/prospects" element={<ProspectsPage />} />
          <Route path="/prospects/:id" element={<ProspectDetailPage />} />
          <Route path="/prospects/:id/edit" element={<ProspectEditPage />} />
          <Route path="/agents" element={<Navigate to="/agents/pending" replace />} />
          <Route path="/agents/pending" element={<AgentsPage />} />
          <Route path="/agents/all" element={<AgentsPage />} />
          <Route path="/agents/payouts" element={<AgentsPage />} />
          <Route path="/agents/targets" element={<AgentTargetsPage />} />
          <Route path="/agents/:id" element={<AgentDetailPage />} />
          <Route path="/agents/:id/commissions" element={<AgentCommissionsPage />} />
          <Route path="/website-content" element={<Navigate to="/website-content/banners" replace />} />
          <Route path="/website-content/:section" element={<WebsiteContentPage />} />
          <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
          <Route path="/settings/subscription/checkout" element={<SubscriptionCheckoutPage />} />
          <Route path="/settings/subscription/payment/:id" element={<SubscriptionPaymentInstructionPage />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          <Route path="/profil-saya" element={<ProfilSayaPage />} />
        </Route>

        <Route path="/dev/components" element={<DevComponentsPage />} />

        {/* KlikUmroh Master Super Admin Portal */}
        <Route path="/internal/login" element={<AdminLoginView />} />
        <Route element={<AdminAuthGuard />}>
          <Route path="/internal/dashboard" element={<AdminDashboardView />} />
          <Route path="/internal/tenants" element={<AdminTenantsView />} />
          <Route path="/internal/tenants/:id" element={<AdminTenantDetailView />} />
          <Route path="/internal/pricing-plans" element={<AdminPlansView />} />
          <Route path="/internal/coupons" element={<AdminCouponsView />} />
          <Route path="/internal/payment-verifications" element={<AdminPaymentsView />} />
          <Route path="/internal/staff" element={<AdminStaffView />} />
          <Route path="/internal/settings" element={<AdminSettingsView />} />
          <Route path="/internal" element={<Navigate to="/internal/dashboard" replace />} />
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
      </SidebarProvider>
    </BrowserRouter>
  );
};

export default App;
