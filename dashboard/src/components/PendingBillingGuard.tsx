import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { fetchTenantSubscription, type TenantSubscriptionInfo } from '../services/api';

const BILLING_PREFIX = '/settings/subscription';

// The invoice a pending travel should act on: the open (pending) one, otherwise the newest one
// (e.g. rejected, so the travel sees the reason and re-uploads).
const billingPathFor = (info: TenantSubscriptionInfo): string => {
  if (info.pending_verification) {
    return `${BILLING_PREFIX}/payment/${info.pending_verification.id}`;
  }
  const latest = [...(info.payment_verifications || [])].sort((a, b) => b.id - a.id)[0];
  return latest ? `${BILLING_PREFIX}/payment/${latest.id}` : BILLING_PREFIX;
};

// Standard SaaS behaviour for a travel that signed up but has not paid yet: the account is
// usable, but every page leads to the billing page until the first payment is approved.
// The backend enforces the same rule (SubscriptionEnforcementMiddleware returns 402 outside
// /subscription endpoints); this guard only keeps the UI from showing pages that would fail.
export const PendingBillingGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [info, setInfo] = useState<TenantSubscriptionInfo | null>(null);
  // Pathname the current `info` was fetched for. A pending result is only trusted for that path, so
  // the first navigation after approval is not bounced back by the stale pending status.
  const [checkedPath, setCheckedPath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const path = location.pathname;
    // While pending, always re-check so the dashboard unlocks right after approval.
    fetchTenantSubscription(info?.status === 'pending')
      .then((data) => {
        if (active) setInfo(data);
      })
      .catch(() => {
        // Network/API failure: fall through, the backend still enforces access.
      })
      .finally(() => {
        if (active) setCheckedPath(path);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (checkedPath === null || (info?.status === 'pending' && checkedPath !== location.pathname)) {
    return null;
  }

  if (info?.status === 'pending' && !location.pathname.startsWith(BILLING_PREFIX)) {
    return <Navigate to={billingPathFor(info)} replace />;
  }

  return <>{children}</>;
};
