// Agent habit tracker (see internal/service/agent_habit.go). Five fixed daily habits; a day is active with 3.
// The portal reports "share", "contact" and "caption" itself; "note" and status-change contacts are read from
// the jamaah data, "sumber" is logged when a source is marked as tried.

export type HabitKey = 'share' | 'contact' | 'caption' | 'note' | 'sumber';

export interface HabitInfo {
  key: HabitKey;
  label: string;
  hint: string;
  href: string;
  action: string;
}

export const HABITS: HabitInfo[] = [
  { key: 'share', label: 'Bagikan link atau paket', hint: 'Salin atau bagikan link Anda dari Beranda', href: '/agen/dashboard', action: 'Bagikan' },
  { key: 'contact', label: 'Hubungi 1 calon jamaah', hint: 'Chat WhatsApp atau ubah status jamaah', href: '/agen/jamaah', action: 'Buka jamaah' },
  { key: 'caption', label: 'Posting caption atau status WA', hint: 'Salin atau kirim caption dari Bank caption', href: '/agen/bank-caption', action: 'Buka caption' },
  { key: 'note', label: 'Catat perkembangan jamaah', hint: 'Tulis catatan di detail jamaah', href: '/agen/jamaah', action: 'Buka jamaah' },
  { key: 'sumber', label: 'Coba 1 sumber jamaah baru', hint: 'Tandai satu sumber sudah dicoba', href: '/agen/sumber-jamaah', action: 'Buka sumber' },
];

export interface HabitDay {
  date: string;
  done: number;
  active: boolean;
}

export interface HabitSummary {
  today: string;
  done_today: HabitKey[];
  total: number;
  active_min: number;
  today_active: boolean;
  streak: number;
  best_streak: number;
  calendar: HabitDay[];
  /** Streak milestones earned so far, smallest first (kept even after a streak breaks). */
  badges: { days: number; achieved_at: string }[];
  /** Next milestone to reach; 0 once all are earned. */
  next_badge: number;
}

const authHeaders = (): Record<string, string> | null => {
  try {
    const token = localStorage.getItem('agent_token');
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
};

// Fire-and-forget: a failed log never blocks the agent's action (keepalive survives opening WhatsApp).
export const logHabit = (habit: 'share' | 'contact' | 'caption') => {
  const headers = authHeaders();
  if (!headers) return;
  fetch('/api/agent/habits/log', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ habit }),
    keepalive: true,
  }).catch(() => {});
};

export const fetchHabitSummary = async (): Promise<HabitSummary | null> => {
  const headers = authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch('/api/agent/habits', { headers });
    return res.ok ? ((await res.json()) as HabitSummary) : null;
  } catch {
    return null;
  }
};

// "99 sumber jamaah" progress, stored on the server. The old browser-only list is moved up once.
const LEGACY_SUMBER_KEY = 'klikumroh_agent_sumber_completed';

/**
 * Legacy browser-stored source ids that still have to be sent to the server: only the ones the server does
 * not know yet. Marking a source done also logs today's "sumber" habit on the server, so replaying ids the
 * server already has would credit today's habit (and the streak) without the agent trying anything new.
 */
export const legacySumberToReplay = (legacy: unknown, serverDone: readonly number[]): number[] => {
  if (!Array.isArray(legacy)) return [];
  const known = new Set(serverDone);
  const out: number[] = [];
  for (const n of legacy) {
    if (Number.isInteger(n) && n > 0 && !known.has(n) && !out.includes(n)) out.push(n);
  }
  return out;
};

const readSumberDone = async (headers: Record<string, string>): Promise<number[] | null> => {
  const res = await fetch('/api/agent/sumber-progress', { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as { done?: number[] };
  return Array.isArray(data.done) ? data.done : [];
};

export const fetchSumberDone = async (): Promise<number[] | null> => {
  const headers = authHeaders();
  if (!headers) return null;
  try {
    let legacy: unknown = [];
    try {
      const saved = localStorage.getItem(LEGACY_SUMBER_KEY);
      legacy = saved ? JSON.parse(saved) : [];
    } catch {
      legacy = [];
    }
    const done = await readSumberDone(headers);
    if (done === null) return null;
    if (!Array.isArray(legacy) || legacy.length === 0) return done;

    const toReplay = legacySumberToReplay(legacy, done);
    const results = await Promise.all(toReplay.map((id) => setSumberDone(id, true)));
    if (results.every(Boolean)) {
      try {
        localStorage.removeItem(LEGACY_SUMBER_KEY);
      } catch {
        // storage unavailable: tried again next time (ids the server then knows are skipped)
      }
    }
    return [...done, ...toReplay.filter((_, i) => results[i])];
  } catch {
    return null;
  }
};

export const setSumberDone = async (id: number, done: boolean): Promise<boolean> => {
  const headers = authHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`/api/agent/sumber-progress/${id}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// Motivating headline for the habit card and page, by today's progress. Framed as daily "syiar Baitullah"
// (inviting people to the Holy Land), soft wording ("semoga"), no promised rewards.
export const habitHeadline = (s: HabitSummary): { title: string; sub: string } => {
  const done = s.done_today.length;
  const left = Math.max(s.active_min - done, 0);
  if (done >= s.total) {
    return {
      title: 'Syiar hari ini tuntas, Alhamdulillah',
      sub: 'Semoga jadi jalan tamu Allah menuju Baitullah. Lanjut besok.',
    };
  }
  if (s.today_active) {
    return {
      title: s.streak > 1 ? `Istiqamah ${s.streak} hari syiar Baitullah` : 'Syiar hari ini terhitung, Alhamdulillah',
      sub: `${s.total - done} langkah lagi untuk syiar yang sempurna`,
    };
  }
  if (done === 0) {
    return {
      title: s.streak > 0 ? `Lanjutkan syiar ${s.streak} hari Anda` : 'Mulai syiar Baitullah hari ini',
      sub: `${s.active_min} langkah kecil, semoga mengantar jamaah ke Tanah Suci`,
    };
  }
  return {
    title: `${left} langkah lagi untuk syiar hari ini`,
    sub: s.streak > 0 ? `Jaga istiqamah ${s.streak} hari Anda` : 'Setiap ajakan bisa jadi jalan seseorang ke Baitullah',
  };
};
