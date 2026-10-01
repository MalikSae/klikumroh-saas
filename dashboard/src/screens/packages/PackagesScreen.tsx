// Paket: the travel's umroh catalog. List, then a full-page editor per package.
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { PackageList } from './PackageList';
import { PackageEditor } from './PackageEditor';
import '../settings/settings.css';
import './packages.css';

export const PackagesScreen: React.FC = () => (
  <Routes>
    <Route index element={<PackageList />} />
    <Route path="new" element={<PackageEditor />} />
    <Route path=":id" element={<PackageEditor />} />
  </Routes>
);
