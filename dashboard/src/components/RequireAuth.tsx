import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getStoredToken } from '../services/api';

// Guards the travel admin dashboard routes. Without this, pages relied on
// API calls to fail before showing anything — but nothing on the client
// enforced a redirect to /login, so the dashboard could render before an
// admin ever authenticated as their own tenant.
export const RequireAuth: React.FC = () => {
  if (!getStoredToken()) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};
