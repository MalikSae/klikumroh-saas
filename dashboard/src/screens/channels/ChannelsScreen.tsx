// Kanal: where prospects come from (website, ads, agents). Ad links and Meta tracking live on their own
// page (Iklan & pelacakan, /tracking).
import React from 'react';
import { ChannelPerformance } from './ChannelPerformance';
import '../settings/settings.css';
import '../dashboard/dashboard.css';
import './channels.css';

export const ChannelsScreen: React.FC = () => <ChannelPerformance />;
