import React from 'react';
import './AgentShell.css';

// The content area under the header of an agent portal page: one margin, one vertical rhythm, the page
// background. withTabBar / withActionBar add the room the fixed bottom bar needs (AgentBottomNavbar, AgentActionBar).
export const AgentPage: React.FC<{ children: React.ReactNode; withTabBar?: boolean; withActionBar?: boolean; className?: string }> = ({
  children,
  withTabBar = false,
  withActionBar = false,
  className = '',
}) => (
  <div className={`ag-shell-page${withTabBar || withActionBar ? ' ag-shell-page--tabbar' : ''} ${className}`.trim()}>{children}</div>
);
