// WhatsApp logo drawn in lucide's style (24x24, 2px round stroke, currentColor). lucide-react has no brand
// icons; approved exception to AGENTS.md 3.4 (founder decision, 7 Oct 2026). Outline after Tabler Icons'
// "brand-whatsapp" (MIT). Same props as a lucide icon so it can be swapped in anywhere.
import React from 'react';

export interface WhatsAppIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

export const WhatsAppIcon: React.FC<WhatsAppIconProps> = ({ size = 24, strokeWidth = 2, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {/* Speech bubble with the tail at the bottom left */}
    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
    {/* Phone handset */}
    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
  </svg>
);
