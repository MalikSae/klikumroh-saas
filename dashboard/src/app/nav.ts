// Sidebar navigation of the travel dashboard: flat menu grouped by business function
// (decided 30 Sep 2026: Beranda · PENJUALAN · KEMITRAAN · PEMASARAN · Pengaturan). No nested sub-menus;
// sections inside a page live on that page.
import type React from 'react';
import { KaabaIcon } from '../ui/icons/KaabaIcon';
import { BarChart3, Globe, Handshake, Home, Megaphone, Settings, Trophy, Users, Wallet } from 'lucide-react';

export type BadgeKey = 'prospects' | 'agents' | 'payouts';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  /** A lucide icon, or KaabaIcon (same props). */
  icon: React.ComponentType<{ className?: string }>;
  badge?: BadgeKey;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ id: 'home', label: 'Beranda', to: '/', icon: Home }] },
  {
    label: 'PENJUALAN',
    items: [
      { id: 'prospects', label: 'Prospek', to: '/prospects', icon: Users, badge: 'prospects' },
      { id: 'packages', label: 'Paket', to: '/packages', icon: KaabaIcon },
    ],
  },
  {
    label: 'KEMITRAAN',
    items: [
      { id: 'agents', label: 'Agen', to: '/agents', icon: Handshake, badge: 'agents' },
      { id: 'payouts', label: 'Pencairan komisi', to: '/payouts', icon: Wallet, badge: 'payouts' },
      { id: 'programs', label: 'Target & reward', to: '/programs', icon: Trophy },
    ],
  },
  {
    label: 'PEMASARAN',
    items: [
      { id: 'channels', label: 'Kanal', to: '/channels', icon: BarChart3 },
      { id: 'tracking', label: 'Iklan & pelacakan', to: '/tracking', icon: Megaphone },
      { id: 'website', label: 'Website', to: '/website', icon: Globe },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { id: 'settings', label: 'Pengaturan', to: '/settings', icon: Settings };

const hit = (path: string, prefix: string) => (prefix === '/' ? path === '/' : path === prefix || path.startsWith(prefix + '/'));

export const itemActive = (item: NavItem, path: string) => hit(path, item.to);

/** Header title for a path: the nav label of the area it belongs to. */
export function titleForPath(path: string): string {
  for (const item of [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM]) {
    if (hit(path, item.to) && item.to !== '/') return item.label;
  }
  if (hit(path, '/account')) return 'Akun saya';
  return 'Beranda';
}
