// Meta Pixel helpers for the travel's public site. The pixel is only active when the travel set a
// Pixel ID in the dashboard (Pengaturan > Integrasi Meta); every call is a no-op otherwise.
//
// Standard events used: PageView (every public page), ViewContent (package detail), Contact
// (WhatsApp contact clicks), Lead (interest form, deduplicated with the server-side CAPI Lead through
// the event ID returned by the backend).

type FbqFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: FbqFunction;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

/** Installs Meta's standard fbq queue stub, so events can be queued before fbevents.js has loaded. */
export function ensureFbqStub(): void {
  if (typeof window === 'undefined' || window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as FbqFunction;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
}

// Events fired before the pixel component initialised (child effects run before it) wait here and
// are sent by flushPendingMetaEvents(). On a site without pixel they are simply never sent.
const pendingEvents: Array<{ name: string; params: Record<string, unknown>; eventId?: string }> = [];

const send = (name: string, params: Record<string, unknown>, eventId?: string) => {
  if (!window.fbq) return;
  if (eventId) window.fbq('track', name, params, { eventID: eventId });
  else window.fbq('track', name, params);
};

/** Sends a standard event (queued until the pixel is ready). eventId deduplicates it against CAPI. */
export function trackMetaEvent(name: string, params?: Record<string, unknown>, eventId?: string): void {
  if (typeof window === 'undefined') return;
  if (!window.fbq) {
    if (pendingEvents.length < 20) pendingEvents.push({ name, params: params || {}, eventId });
    return;
  }
  send(name, params || {}, eventId);
}

/** Called by the pixel component right after init: sends events queued before it was ready. */
export function flushPendingMetaEvents(): void {
  if (typeof window === 'undefined' || !window.fbq) return;
  while (pendingEvents.length > 0) {
    const ev = pendingEvents.shift()!;
    send(ev.name, ev.params, ev.eventId);
  }
}

/** True when the pixel was initialised on this page. */
export function isMetaPixelActive(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

const readCookie = (name: string): string => {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
};

/** The visitor's Meta browser identifiers, sent with the interest form for server-side matching. */
export function getMetaBrowserContext(): { fbp: string; fbc: string; event_source_url: string } {
  return {
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    event_source_url: typeof window !== 'undefined' ? window.location.href.split('#')[0] : '',
  };
}
