// Shared by the login page and the signup checkout: store the travel admin session returned by
// POST /api/auth/login and build the URL that opens the dashboard with it.

export interface LoginResponse {
  token: string;
  // One-time code bound to this browser (HttpOnly cookie); the dashboard trades it for the session.
  handoff_code?: string;
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
// always ends up on its billing page (the dashboard's AppFrame redirects it), so callers only pass a
// path when they already know the invoice.
export function dashboardUrl(data: LoginResponse, path = '/'): string {
  // The dashboard runs on its own origin (app.klikumroh.id; localhost:5175 in local dev), so
  // localStorage is not shared. The URL carries only the one-time handoff code, never the token: the
  // dashboard redeems it, and only this browser (it holds the cookie set by the login) can.
  const origin = isLocalHost() ? 'http://localhost:5175' : 'https://app.klikumroh.id';
  if (!data.handoff_code) return `${origin}/`;
  const payload = encodeURIComponent(JSON.stringify({ code: data.handoff_code, redirect: path }));
  return `${origin}/#handoff=${payload}`;
}

export function openDashboard(url: string): void {
  window.location.href = url;
}
