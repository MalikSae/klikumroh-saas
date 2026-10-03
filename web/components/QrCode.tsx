'use client';

// QR code drawn as an SVG path from the qrcode library's module matrix (no canvas, no innerHTML).
// Color follows currentColor, so the surrounding CSS decides it (tokens only).
import React, { useMemo } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  size?: number;
  label: string;
  className?: string;
}

export const QrCode: React.FC<QrCodeProps> = ({ value, size = 140, label, className }) => {
  const { path, count } = useMemo(() => {
    if (!value) return { path: '', count: 0 };
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [value]);

  if (!path) return null;
  // A quiet zone of 2 modules around the code keeps scanners happy.
  const q = 2;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${-q} ${-q} ${count + q * 2} ${count + q * 2}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
};
