import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { getStoredToken } from '../services/api';

// Guards the travel admin dashboard routes. Without this, pages relied on
// API calls to fail before showing anything.
// Unauthenticated users are redirected directly to the central login page.
export const RequireAuth: React.FC = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const impersonateToken = searchParams.get('impersonate_token');
  if (impersonateToken) {
    localStorage.setItem('klikumroh_token', impersonateToken);
    localStorage.setItem('klikumroh_impersonated', 'true');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const token = getStoredToken();

  useEffect(() => {
    if (!token) {
      const isLocal =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1');
      const loginUrl = isLocal
        ? 'http://localhost:3000/login'
        : '/login';
      window.location.href = loginUrl;
    }
  }, [token]);

  if (!token) {
    return null;
  }

  return <Outlet />;
};
