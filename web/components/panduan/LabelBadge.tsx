import styles from './Panduan.module.css';

const CLASS: Record<string, string> = {
  wajib: styles.badgeWajib,
  disarankan: styles.badgeDisarankan,
  opsional: styles.badgeOpsional,
};

/**
 * Wajib / Disarankan / Opsional. The text carries the meaning; fill versus outline only reinforces it.
 * Takes plain strings (not a chapter) so client components can use it without bundling the guide text.
 */
export function LabelBadge({ kind, text }: { kind: string; text: string }) {
  if (!text) return null;
  return <span className={`${styles.badge} ${CLASS[kind] ?? ''}`}>{text}</span>;
}
