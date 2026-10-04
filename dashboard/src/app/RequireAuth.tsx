import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { getStoredToken, webLoginUrl } from '../services/api';


// Guards the travel admin dashboard routes. Without this, pages relied on
// API calls to fail before showing anything.
// Unauthenticated users are redirected directly to the central login page.
export const RequireAuth: React.FC = () => {
  // Staff impersonation arrives through the #handoff= code redeemed in main.tsx, like a normal login.
  const token = getStoredToken();

  useEffect(() => {
    if (!token) {
      window.location.href = webLoginUrl();
    }
  }, [token]);

  if (!token) {
    return null;
  }

  return (

      <Outlet />

  );
};
