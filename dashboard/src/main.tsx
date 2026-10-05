import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import App from './App.tsx';
import { API_BASE, setAuthSession, setImpersonatedSession } from './services/api';

// ---------------------------------------------------------------------------
// Cross-origin auth handoff
// ---------------------------------------------------------------------------
// Travel admins log in on the Next.js app (klikumroh.id; localhost:3000 in local dev), but the dashboard
// runs on another origin (app.klikumroh.id; localhost:5175), so localStorage is not shared. The login page
// sends #handoff={code, redirect}: a one-time code, never the token. We trade it for the session here,
// before React mounts, so RequireAuth finds it. The exchange only succeeds in the browser that logged in
// (it holds the HttpOnly ku_handoff cookie), so a link crafted by someone else cannot sign a visitor into
// another account. Staff impersonation (AdminTenantDetailView) opens a tab with the same kind of code.
// ---------------------------------------------------------------------------
async function redeemHandoff(): Promise<void> {
  const hash = window.location.hash;
  if (!hash.startsWith('#handoff=')) return;
  let target = '/';
  try {
    const payload = JSON.parse(decodeURIComponent(hash.slice('#handoff='.length)));
    // Optional landing path (e.g. the billing page right after signup). Only same-origin
    // absolute paths are accepted, so the payload can't send the user to another site.
    if (typeof payload.redirect === 'string' && /^\/(?![/\\])/.test(payload.redirect)) {
      target = payload.redirect;
    }
    if (typeof payload.code === 'string' && payload.code) {
      const res = await fetch(`${API_BASE}/api/auth/handoff/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: payload.code }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token && data.user) {
          setAuthSession(data.token, data.user);
          // Set by the server for staff impersonation, never taken from the URL.
          setImpersonatedSession(Boolean(data.impersonated));
        }
      }
    }
  } catch {
    // Malformed payload or network error: without a session RequireAuth sends the user to login.
  }
  // Clean the URL so the code doesn't linger in the address bar or history.
  history.replaceState(null, '', target);
}

void redeemHandoff().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
