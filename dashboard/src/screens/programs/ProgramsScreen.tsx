// Program agen: sales targets with rewards, and the rules agents earn and register under.
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { RouteTabs } from '../../ui';
import { Targets } from './Targets';
import { Rules } from './Rules';
import '../settings/settings.css';
import './programs.css';

export const ProgramsScreen: React.FC = () => (
  <div className="ag">
    <RouteTabs
      label="Bagian program agen"
      items={[
        { to: '/programs', label: 'Target & hadiah' },
        { to: '/programs/rules', label: 'Aturan komisi & pendaftaran' },
      ]}
    />
    <Routes>
      <Route index element={<Targets />} />
      <Route path="rules" element={<Rules />} />
      <Route path=":id" element={<Targets />} />
    </Routes>
  </div>
);
