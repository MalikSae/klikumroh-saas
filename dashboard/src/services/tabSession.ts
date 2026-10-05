// Per-tab pin of the travel admin session token.
//
// localStorage is shared by every tab of the dashboard origin. When another tab logs in to another account
// or opens another travel by staff impersonation (main.tsx handoff), it overwrites the shared token, and
// this tab would silently send the next save for "travel A" (still on screen) with travel B's token.
// Each tab therefore remembers the token it started with (or set itself). Once the shared token no longer
// matches, the tab is "switched": requests are refused and the frame shows a notice asking for a reload.
// Pure (storage is injected) so it can be tested in node.

export interface TabSession {
  /** Token this tab works with, or null when it has none yet. */
  pinned(): string | null;
  /** This tab set or cleared the session itself (login, handoff, logout): follow it. */
  adopt(token: string | null): void;
  /** Compares the shared token with the pin; returns true when the session was switched elsewhere. */
  check(): boolean;
  isSwitched(): boolean;
  subscribe(listener: () => void): () => void;
}

export const createTabSession = (readShared: () => string | null): TabSession => {
  let pin: string | null = readShared();
  let switched = false;
  const listeners = new Set<() => void>();

  const check = (): boolean => {
    if (switched) return true;
    const shared = readShared();
    if (shared === pin) return false;
    if (pin === null) {
      // This tab had no session (nothing on screen belongs to an account): take the new one over.
      pin = shared;
      return false;
    }
    switched = true;
    // Async: check() can run while React renders (getStoredToken in a route guard), and a listener
    // updating another component during that render is not allowed.
    queueMicrotask(() => listeners.forEach((l) => l()));
    return true;
  };

  return {
    pinned: () => pin,
    adopt: (token) => {
      // A switched tab stays blocked until reload, even if it later writes the store itself.
      if (!switched) pin = token;
    },
    check,
    isSwitched: () => switched,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export class SessionSwitchedError extends Error {
  constructor() {
    super('Sesi berganti di tab lain. Muat ulang halaman sebelum menyimpan perubahan.');
    this.name = 'SessionSwitchedError';
  }
}
