// Target & reward: sales targets with rewards. The rules agents earn and register under live in
// Pengaturan > Aturan agen (/settings/agent-rules).
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Targets } from './Targets';
import '../settings/settings.css';
import './programs.css';

export const ProgramsScreen: React.FC = () => (
  <div className="ag">
    <Routes>
      <Route index element={<Targets />} />
      <Route path=":id" element={<Targets />} />
    </Routes>
  </div>
);
