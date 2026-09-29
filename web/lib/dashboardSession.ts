// Shared by the login page and the signup checkout: store the travel admin session returned by
// POST /api/auth/login and build the URL that opens the dashboard with it.

export interface LoginResponse {
  token: string;
  tenant_status?: string;
  user?: { tenant_name?: string } & Record<string, unknown>;
}

const isLocalHost = (): boolean =>
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.local'));

export function storeDashboardSession(data: LoginResponse): void {
  if (typeof window === 'undefined') return;
  if (data.token) {
    localStorage.setItem('klikumroh_token', data.token);
    document.cookie = `klikumroh_token=${encodeURIComponent(data.token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }
  if (data.user) {
    localStorage.setItem('klikumroh_user', JSON.stringify({ ...data.user, tenant_status: data.tenant_status }));
    if (data.user.tenant_name) {
      localStorage.setItem('klikumroh_travel_name', data.user.tenant_name);
    }
  }
}

export function clearDashboardSession(): void {
  try {
    localStorage.removeItem('klikumroh_token');
    localStorage.removeItem('klikumroh_user');
    localStorage.removeItem('klikumroh_travel_name');
    document.cookie = 'klikumroh_token=; path=/; max-age=0; SameSite=Lax';
  } catch {}
}

// The session saved by an earlier login/signup in this browser, if any.
export function storedDashboardSession(): LoginResponse | null {
  try {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('klikumroh_token');
    if (!token) return null;
    const rawUser = localStorage.getItem('klikumroh_user');
    const user = rawUser ? JSON.parse(rawUser) : undefined;
    return { token, tenant_status: user?.tenant_status, user };
  } catch {
    return null;
  }
}

// `path` is a dashboard route such as '/' or '/settings/subscription/payment/12'. A pending travel
// always ends up on its billing page (the dashboard's PendingBillingGuard), so callers only pass a
// path when they already know the invoice.
export function dashboardUrl(data: LoginResponse, path = '/'): string {
  if (isLocalHost()) {
    // In local dev the dashboard runs on another origin (localhost:5175), so localStorage is not
    // shared. Pass the session in the URL fragment; the dashboard stores it and cleans the URL.
    const payload = encodeURIComponent(JSON.stringify({ token: data.token, user: data.user, redirect: path }));
    return `http://localhost:5175/#auth=${payload}`;
  }
  return path;
}

export function openDashboard(url: string): void {
  window.location.href = url;
}
