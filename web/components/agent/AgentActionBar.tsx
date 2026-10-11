import React from 'react';
import './AgentShell.css';

// The main action of a page, pinned to the bottom of the screen (above the device's safe area) so it stays in
// reach while the content scrolls. One bar per page, one primary button in it. A page that uses it passes
// `withActionBar` to <AgentPage> so the last content is not hidden behind the bar.
export const AgentActionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ag-action-bar">{children}</div>
);
