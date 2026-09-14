'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import './WhatsAppFloatingWidget.css';

export const WhatsAppFloatingWidget: React.FC = () => {
  const { whatsappDemoUrl } = usePlatformSettings();

  return (
    <a
      href={whatsappDemoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mkt-wa-float"
      aria-label="Konsultasi via WhatsApp"
    >
      <MessageCircle className="mkt-wa-float__icon" />
      <span>Tanya via WhatsApp</span>
    </a>
  );
};
