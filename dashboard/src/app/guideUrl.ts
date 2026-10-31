/** The travel admins' guide lives on the Next.js app (klikumroh.id; localhost:3000 in local dev), not in this SPA. */
export function guideUrl(slug?: string): string {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const origin = local ? 'http://localhost:3000' : 'https://klikumroh.id';
  return `${origin}/panduan${slug && slug !== 'mulai-dari-sini' ? `/${slug}` : ''}`;
}
