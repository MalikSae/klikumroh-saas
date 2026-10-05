// Hosts that serve KlikUmroh itself (same list as PLATFORM_HOSTS in proxy.ts and the marketing check in
// app/page.tsx). Every other host belongs to a travel, even when that travel is unknown or not active.
const PLATFORM_HOSTS = new Set(['klikumroh.id', 'www.klikumroh.id', 'klikumroh.local', 'localhost', '127.0.0.1']);

/** Whether a Host header value (port allowed) is one of KlikUmroh's own hosts. */
export const isPlatformHost = (hostHeader: string | null | undefined): boolean =>
  PLATFORM_HOSTS.has((hostHeader || '').split(':')[0].trim().toLowerCase());
