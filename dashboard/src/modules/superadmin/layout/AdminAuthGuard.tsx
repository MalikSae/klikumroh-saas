import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredStaffToken } from '../../../services/staffApi';

export const AdminAuthGuard: React.FC = () => {
  const token = getStoredStaffToken();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/internal/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};
