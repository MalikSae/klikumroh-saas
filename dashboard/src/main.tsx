import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './index.css';
import App from './App.tsx';

// ---------------------------------------------------------------------------
// Cross-origin auth handoff (local dev only)
// ---------------------------------------------------------------------------
// When a user logs in via the Next.js app (localhost:3000), the token can't
// be shared through localStorage because the dashboard runs on a different
// origin (localhost:5175). The Next.js login page passes credentials through
// a URL hash fragment: #auth={encoded JSON}.  We extract them here, persist
// to localStorage, then clean the URL before React mounts so RequireAuth
// finds a valid session.
// ---------------------------------------------------------------------------
(() => {
  const hash = window.location.hash;
  if (!hash.startsWith('#auth=')) return;
  try {
    const payload = JSON.parse(decodeURIComponent(hash.slice('#auth='.length)));
    if (payload.token) {
      localStorage.setItem('klikumroh_token', payload.token);
    }
    if (payload.user) {
      localStorage.setItem('klikumroh_user', JSON.stringify(payload.user));
      if (payload.user.tenant_name) {
        localStorage.setItem('klikumroh_travel_name', payload.user.tenant_name);
      }
    }
  } catch {
    // Malformed payload — ignore, RequireAuth will redirect to /login
  }
  // Clean the URL so the token doesn't linger in the address bar
  history.replaceState(null, '', '/');
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
