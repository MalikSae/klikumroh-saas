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
import { HANDOFF_FAILED_KEY, parseHandoffHash, toHandoffKind, type HandoffKind } from './services/handoff';
import { HandoffFailed } from './app/HandoffFailed';

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
// A failed exchange (expired code, missing cookie, server restart) must not fall back to whatever session
// is still stored: that could be another travel staff impersonated earlier. The tab shows an error
// instead, remembered per tab (sessionStorage) so a reload doesn't fall back either. Other tabs keep
// their sessions untouched.
async function redeemHandoff(): Promise<HandoffKind | null> {
  const payload = parseHandoffHash(window.location.hash);
  if (!payload) return readFailedHandoff();
  let ok = false;
  if (payload.code) {
    try {
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
          ok = true;
        }
      }
    } catch {
      // Network error or bad JSON: handled as a failed handoff below.
    }
  }
  // Clean the URL so the code doesn't linger in the address bar or history.
  history.replaceState(null, '', ok ? payload.redirect : '/');
  try {
    if (ok) sessionStorage.removeItem(HANDOFF_FAILED_KEY);
    else sessionStorage.setItem(HANDOFF_FAILED_KEY, payload.kind);
  } catch {
    /* storage unavailable: the error still shows for this page load */
  }
  return ok ? null : payload.kind;
}

function readFailedHandoff(): HandoffKind | null {
  try {
    return toHandoffKind(sessionStorage.getItem(HANDOFF_FAILED_KEY));
  } catch {
    return null;
  }
}

void redeemHandoff().then((failed) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {failed ? <HandoffFailed kind={failed} /> : <App />}
    </StrictMode>,
  );
});
