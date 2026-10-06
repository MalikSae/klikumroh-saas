// Script WA remembers the last jamaah name typed in "Ketik manual" (browser storage). A device can be shared
// by several agents of the same travel, so the name is stored per agent and every logout removes it: the
// next agent on that device never sees the previous agent's jamaah. The unscoped key used before is
// removed as well.
export const SCRIPT_PROSPECT_NAME_PREFIX = 'klikumroh_agent_script_prospect_name';

/** Storage key for one agent (agent id from /api/agent/me). */
export const scriptProspectNameKey = (agentKey: string | number): string =>
  `${SCRIPT_PROSPECT_NAME_PREFIX}:${agentKey}`;

type KeyedStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>;

/** Removes every stored manual jamaah name (all agents, plus the old unscoped key). Never throws. */
export function clearScriptProspectNames(storage: KeyedStorage | null | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && (k === SCRIPT_PROSPECT_NAME_PREFIX || k.startsWith(SCRIPT_PROSPECT_NAME_PREFIX + ':'))) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    // Storage blocked (private mode): nothing stored either.
  }
}
