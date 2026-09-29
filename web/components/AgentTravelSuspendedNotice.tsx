import React from 'react';
import { AlertCircle } from 'lucide-react';
import styles from './AgentTravelSuspendedNotice.module.css';

// Shown in the agent portal while the travel's subscription is suspended (past the grace period):
// the portal is read-only, but the agent's jamaah, commissions and payouts stay available.
export const AgentTravelSuspendedNotice: React.FC = () => (
  <div className={styles.notice} role="status">
    <AlertCircle size={16} className={styles.icon} aria-hidden="true" />
    <p className={styles.text}>
      Layanan travel sedang ditangguhkan. Data jamaah dan komisi tetap bisa dilihat dan pencairan tetap bisa
      diajukan; menambah atau mengubah jamaah bisa dilakukan lagi setelah travel memperpanjang langganan.
    </p>
  </div>
);
