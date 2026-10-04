// API client for the Affiliator KlikUmroh portal (/affiliator/*). Own token, never the travel admin or
// staff session: the backend only accepts it on /api/affiliator/*.
import { API_BASE } from './api';

const TOKEN_KEY = 'klikumroh_affiliator_token';

export interface Affiliator {
  id: number;
  name: string;
  email: string;
  whatsapp?: string | null;
  link_code: string;
  status: string;
  first_rate: number | null;
  renewal_rate: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  created_at: string;
}

export interface AffiliatorBalance {
  held: number;
  available: number;
  requested: number;
  paid: number;
}

export interface AffiliatorOverview {
  affiliator: Affiliator;
  coupon_code: string | null;
  coupon_discount: number;
  first_rate: number;
  renewal_rate: number;
  hold_days: number;
  min_payout: number;
  clicks: number;
  tenant_count: number;
  active_tenants: number;
  balance: AffiliatorBalance;
}

export interface AffiliatorTenant {
  tenant_id: number;
  name: string;
  status: string;
  subscription_expires_at: string | null;
  source: 'coupon' | 'link' | string;
  affiliated_at: string;
}

export interface AffiliatorCommission {
  id: number;
  tenant_id: number;
  tenant_name: string;
  payment_verification_id: number;
  kind: 'first' | 'renewal';
  base_amount: number;
  rate: number;
  amount: number;
  available_at: string;
  payout_id: number | null;
  created_at: string;
}

export interface AffiliatorPayout {
  id: number;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AffiliatorBankInput {
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export const getAffiliatorToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const setAffiliatorToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearAffiliatorToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

/** Where the affiliator shares its link: the KlikUmroh landing page of this environment. */
export const affiliatorLink = (code: string): string => {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return `${local ? 'http://localhost:3000' : 'https://klikumroh.id'}/?aff=${encodeURIComponent(code)}`;
};

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAffiliatorToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (auth && res.status === 401) {
      clearAffiliatorToken();
      if (!window.location.pathname.startsWith('/affiliator/login')) window.location.href = '/affiliator/login';
    }
    throw new Error(json.error || 'Terjadi kesalahan, coba lagi.');
  }
  return json as T;
}

interface AuthResult {
  token: string;
  affiliator: Affiliator;
}

export const registerAffiliator = async (input: { name: string; email: string; password: string; whatsapp?: string }) => {
  const res = await request<AuthResult>('/api/affiliator/register', { method: 'POST', body: JSON.stringify(input) }, false);
  setAffiliatorToken(res.token);
  return res.affiliator;
};

export const loginAffiliator = async (email: string, password: string) => {
  const res = await request<AuthResult>('/api/affiliator/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
  setAffiliatorToken(res.token);
  return res.affiliator;
};

export const logoutAffiliator = async () => {
  try {
    await request('/api/affiliator/logout', { method: 'POST' }, true);
  } catch {
    /* the local session is cleared anyway */
  }
  clearAffiliatorToken();
};

export const fetchAffiliatorOverview = () => request<AffiliatorOverview>('/api/affiliator/me');
export const setAffiliatorCoupon = (code: string) =>
  request<{ code: string; discount_percentage: number }>('/api/affiliator/coupon', { method: 'PUT', body: JSON.stringify({ code }) });
export const updateAffiliatorBank = (input: AffiliatorBankInput) =>
  request<{ message: string }>('/api/affiliator/bank', { method: 'PUT', body: JSON.stringify(input) });
export const fetchAffiliatorTenants = async () => (await request<{ tenants: AffiliatorTenant[] }>('/api/affiliator/tenants')).tenants;
export const fetchAffiliatorCommissions = async () =>
  (await request<{ commissions: AffiliatorCommission[] }>('/api/affiliator/commissions')).commissions;
export const fetchAffiliatorPayouts = async () => (await request<{ payouts: AffiliatorPayout[] }>('/api/affiliator/payouts')).payouts;
export const requestAffiliatorPayout = () => request<AffiliatorPayout>('/api/affiliator/payouts', { method: 'POST' });
/** The affiliator changes its own password; other devices are signed out, this one stays. */
export const changeAffiliatorPassword = (currentPassword: string, newPassword: string) =>
  request<{ message: string }>('/api/affiliator/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
