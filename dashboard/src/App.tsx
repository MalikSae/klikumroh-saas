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
import { StaffLoginPage } from './pages/StaffLogin';
import { StaffTenantsPage } from './pages/StaffTenants';
import { StaffPricingPlansPage } from './pages/StaffPricingPlans';
import { StaffCouponsPage } from './pages/StaffCoupons';
import { StaffPaymentVerificationsPage } from './pages/StaffPaymentVerifications';
import { StaffTenantDetailPage } from './pages/StaffTenantDetail';
import { StaffSettingsPage } from './pages/StaffSettings';

import { AdminLoginPage } from './pages/AdminLogin';
import { SidebarProvider } from './components/SidebarContext';
import { RequireAuth } from './components/RequireAuth';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <Routes>
        <Route path="/login" element={<AdminLoginPage />} />

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

        {/* KlikUmroh Internal Staff Portal */}
        <Route path="/internal/login" element={<StaffLoginPage />} />
        <Route path="/internal/tenants" element={<StaffTenantsPage />} />
        <Route path="/internal/tenants/:id" element={<StaffTenantDetailPage />} />
        <Route path="/internal/pricing-plans" element={<StaffPricingPlansPage />} />
        <Route path="/internal/coupons" element={<StaffCouponsPage />} />
        <Route path="/internal/payment-verifications" element={<StaffPaymentVerificationsPage />} />
        <Route path="/internal/settings" element={<StaffSettingsPage />} />
        <Route path="/internal" element={<Navigate to="/internal/tenants" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </SidebarProvider>
    </BrowserRouter>
  );
};

export default App;
