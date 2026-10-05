import assert from 'node:assert';
import { createTabSession } from '../src/services/tabSession.ts';
import {
  awaitingPayoffAgentNote,
  closingCommissionNote,
  closingPayoffNote,
  lostReasonNote,
  paidOffDialogNote,
} from '../src/utils/prospectTexts.ts';
import { passwordLongEnough, resetPasswordProblem } from '../src/utils/password.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

// --- Tab session pin (cross-tab token switch) ---
{
  let shared = 'token-A';
  const s = createTabSession(() => shared);
  let notified = 0;
  s.subscribe(() => notified++);
  assert.strictEqual(s.pinned(), 'token-A');
  assert.strictEqual(s.check(), false);
  // Another tab (staff impersonating travel B) replaces the shared token.
  shared = 'token-B';
  assert.strictEqual(s.check(), true);
  assert.strictEqual(s.isSwitched(), true);
  // This tab keeps its own token, never the other tab's.
  assert.strictEqual(s.pinned(), 'token-A');
  await tick();
  assert.strictEqual(notified, 1);
  // Stays switched (and notifies once) even if the shared token comes back.
  shared = 'token-A';
  assert.strictEqual(s.check(), true);
  s.adopt('token-C');
  assert.strictEqual(s.pinned(), 'token-A');
  await tick();
  assert.strictEqual(notified, 1);
}
{
  // Logout in another tab also counts as a switch.
  let shared = 'token-A';
  const s = createTabSession(() => shared);
  shared = null;
  assert.strictEqual(s.check(), true);
}
{
  // A tab without a session takes over a login made elsewhere (nothing of an old account on screen).
  let shared = null;
  const s = createTabSession(() => shared);
  shared = 'token-A';
  assert.strictEqual(s.check(), false);
  assert.strictEqual(s.pinned(), 'token-A');
}
{
  // The tab's own login/handoff/logout is followed, not treated as a switch.
  let shared = 'token-A';
  const s = createTabSession(() => shared);
  shared = 'token-B';
  s.adopt('token-B');
  assert.strictEqual(s.check(), false);
  shared = null;
  s.adopt(null);
  assert.strictEqual(s.check(), false);
}

// --- Lost reason note ---
assert.strictEqual(lostReasonNote('harga', 'Harga tidak cocok', 'Harga tidak cocok'), '');
assert.strictEqual(lostReasonNote('harga', 'Harga tidak cocok', '  minta diskon 2 jt '), 'minta diskon 2 jt');
assert.strictEqual(lostReasonNote('lainnya', 'Lainnya', 'pindah kota'), 'pindah kota');
assert.strictEqual(lostReasonNote('harga', 'Harga tidak cocok', null), '');
assert.strictEqual(lostReasonNote('batal_setelah_dp', 'Batal setelah DP', 'Batal setelah DP: sakit'), 'sakit');
assert.strictEqual(lostReasonNote('batal_setelah_dp', 'Batal setelah DP', 'Batal setelah DP'), '');
// Legacy row without a category: no label to compare against, the caller shows the free text itself.
assert.strictEqual(lostReasonNote(null, '', 'apa saja'), '');

// --- Commission release wording ---
const held = { type: 'final', held_amount: 500_000, released_amount: 0 };
const released = { type: 'final', held_amount: 0, released_amount: 500_000 };
assert.match(closingPayoffNote(true, held), /tertahan/);
assert.doesNotMatch(closingPayoffNote(true, released), /tertahan/);
assert.match(closingPayoffNote(true, released), /sudah bisa dicairkan/);
assert.strictEqual(closingPayoffNote(false, held), 'Tandai lunas setelah jamaah melunasi.');
assert.strictEqual(closingPayoffNote(true, { type: 'final', held_amount: 0, released_amount: 0 }), 'Tandai lunas setelah jamaah melunasi.');
assert.match(paidOffDialogNote(true, held), /tertahan/);
assert.strictEqual(paidOffDialogNote(true, released), '');
assert.match(closingCommissionNote('Budi', 'lunas'), /tertahan sampai jamaah ditandai lunas/);
assert.doesNotMatch(closingCommissionNote('Budi', 'dp'), /tertahan/);
assert.doesNotMatch(closingCommissionNote('Budi', null), /tertahan/);
const fmt = (n) => String(n);
assert.match(awaitingPayoffAgentNote(3, 'lunas', fmt), /masih tertahan/);
assert.doesNotMatch(awaitingPayoffAgentNote(3, 'dp', fmt), /tertahan/);
assert.doesNotMatch(awaitingPayoffAgentNote(3, null, fmt), /tertahan/);
assert.strictEqual(awaitingPayoffAgentNote(0, 'lunas', fmt), '.');

// --- Password length like the backend's passwordLongEnough ---
assert.strictEqual(passwordLongEnough('12345678'), true);
assert.strictEqual(passwordLongEnough('1234567'), false);
assert.strictEqual(passwordLongEnough('  1234567  '), false); // padded to 11, only 7 count
assert.strictEqual(passwordLongEnough('        '), false);
assert.strictEqual(passwordLongEnough(' abcdefgh '), true);
assert.strictEqual(passwordLongEnough('abcdéfg'), true); // 8 UTF-8 bytes, like Go's len()
// Admin-set passwords still refuse outer spaces (intentional).
assert.strictEqual(resetPasswordProblem(' abcdefgh ') !== null, true);

console.log('tab-session-texts: all assertions passed');
