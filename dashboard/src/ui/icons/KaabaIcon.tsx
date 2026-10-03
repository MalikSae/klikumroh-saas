// Ka'bah icon drawn in lucide's style (24x24, 2px round stroke, currentColor). lucide-react has no
// Ka'bah; this is the one approved exception to AGENTS.md 3.4 (founder decision, 1 Oct 2026).
// Same props as a lucide icon so it can be swapped in anywhere. Same drawing as web/components/icons/KaabaIcon.tsx.
import React from 'react';

export interface KaabaIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

export const KaabaIcon: React.FC<KaabaIconProps> = ({ size = 24, strokeWidth = 2, ...rest }) => (
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
    {/* Cube seen from a corner: outline, top edges, front corner */}
    <path d="M12 3 3 6.5v11L12 21l9-3.5v-11L12 3Z" />
    <path d="M3 6.5 12 10l9-3.5" />
    <path d="M12 10v11" />
    {/* Kiswah band */}
    <path d="M3 9.5 12 13l9-3.5" />
    {/* Door on the right face */}
    <path d="M15.5 14.5v4.5" />
    <path d="M18 13.5v4.5" />
  </svg>
);
