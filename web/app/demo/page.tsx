'use client';

// /demo: one-click sign-in to the dashboard of the demo travel (demo.klikumroh.id), linked from
// "Coba demo" on the landing page. No password is shared: POST /api/auth/demo-login only works for the
// travel marked is_demo, and what it may change is limited on the server (middleware.DemoGuard).
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { dashboardUrl, openDashboard, storeDashboardSession } from '@/lib/dashboardSession';
import styles from './demo.module.css';

export default function DemoLoginPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/demo-login', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 404 ? 'Demo sedang disiapkan. Coba lagi beberapa saat lagi.' : data.error || 'Demo belum bisa dibuka.');
        if (cancelled) return;
        storeDashboardSession(data);
        openDashboard(dashboardUrl(data));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Demo belum bisa dibuka.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.page}>
      {error ? (
        <div>
          <p>{error}</p>
          <Link href="/" className={styles.link}>
            Kembali ke beranda
          </Link>
        </div>
      ) : (
        <p className={styles.status}>
          <Loader2 size={18} className="tw-animate-spin" aria-hidden="true" />
          Menyiapkan dashboard demo...
        </p>
      )}
    </main>
  );
}
