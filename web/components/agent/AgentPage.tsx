import React from 'react';
import './AgentShell.css';

// The content area under the header of an agent portal page: one margin, one vertical rhythm, the page
// background. withTabBar adds the room the fixed bottom bar needs (pages that render AgentBottomNavbar).
export const AgentPage: React.FC<{ children: React.ReactNode; withTabBar?: boolean; className?: string }> = ({
  children,
  withTabBar = false,
  className = '',
}) => <div className={`ag-shell-page${withTabBar ? ' ag-shell-page--tabbar' : ''} ${className}`.trim()}>{children}</div>;
