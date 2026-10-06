import assert from 'node:assert';
import { handoffFailedText, parseHandoffHash, toHandoffKind } from '../src/services/handoff.ts';
import { ledgerSign, ledgerTone } from '../src/utils/commissionLedger.ts';
import { prospectListStateFromParams, sameProspectListState, withExtraDepartureMonths } from '../src/utils/prospectListQuery.ts';
import { affiliatorPayoutState, hasBankDetails } from '../src/modules/affiliator/payoutRule.ts';

const hash = (o) => '#handoff=' + encodeURIComponent(JSON.stringify(o));

// --- Auth handoff payload ---
assert.strictEqual(parseHandoffHash(''), null);
assert.strictEqual(parseHandoffHash('#other'), null);
assert.deepStrictEqual(parseHandoffHash(hash({ code: 'abc', redirect: '/settings/billing' })), { code: 'abc', redirect: '/settings/billing', kind: 'login' });
assert.deepStrictEqual(parseHandoffHash(hash({ code: 'abc', redirect: '/', source: 'staff' })), { code: 'abc', redirect: '/', kind: 'staff' });
// Unsafe redirects fall back to '/'.
assert.strictEqual(parseHandoffHash(hash({ code: 'a', redirect: '//evil.example' })).redirect, '/');
assert.strictEqual(parseHandoffHash(hash({ code: 'a', redirect: '/\\evil.example' })).redirect, '/');
assert.strictEqual(parseHandoffHash(hash({ code: 'a', redirect: 'https://evil.example' })).redirect, '/');
// Malformed or code-less payloads are a failed handoff (code null), never "no handoff".
assert.deepStrictEqual(parseHandoffHash('#handoff=%7Bnot-json'), { code: null, redirect: '/', kind: 'login' });
assert.strictEqual(parseHandoffHash(hash({ redirect: '/' })).code, null);
assert.strictEqual(parseHandoffHash(hash({ code: '' })).code, null);
assert.strictEqual(toHandoffKind('staff'), 'staff');
assert.strictEqual(toHandoffKind('login'), 'login');
assert.strictEqual(toHandoffKind('x'), null);
assert.strictEqual(toHandoffKind(null), null);
assert.ok(handoffFailedText('staff').description.startsWith('Sesi impersonasi gagal dibuka, coba lagi dari panel staf'));
assert.ok(handoffFailedText('login').title.length > 0);

// --- Commission history sign ---
assert.strictEqual(ledgerTone({ source: 'ledger', direction: 'masuk' }), 'in');
assert.strictEqual(ledgerTone({ source: 'payout', direction: 'keluar', status: 'paid' }), 'out');
assert.strictEqual(ledgerTone({ source: 'payout', direction: 'keluar', status: 'pending' }), 'out');
// Rejected payout: neutral whatever direction an old or new backend sends.
assert.strictEqual(ledgerTone({ source: 'payout', direction: 'keluar', status: 'rejected' }), 'neutral');
assert.strictEqual(ledgerTone({ source: 'payout', direction: 'netral', status: 'rejected' }), 'neutral');
assert.strictEqual(ledgerTone({ source: 'payout', direction: 'keluar', status: 'approved', counts_against_balance: false }), 'neutral');
assert.strictEqual(ledgerTone({ source: 'payout', direction: '' }), 'neutral');
assert.strictEqual(ledgerSign('out'), '−');
assert.strictEqual(ledgerSign('in'), '+');
assert.strictEqual(ledgerSign('neutral'), '');

// --- Prospect list state from the URL ---
const SIZES = [25, 50, 100];
const defaults = prospectListStateFromParams(new URLSearchParams(''), SIZES);
assert.deepStrictEqual(defaults, { status: 'all', source: 'all', pkg: 'all', agent: 'all', payoff: 'all', departure: 'all', page: 1, pageSize: 25 });
const s = prospectListStateFromParams(new URLSearchParams('status=closing&package=4&departure=2026-09&page=3&size=50'), SIZES);
assert.deepStrictEqual(s, { status: 'closing', source: 'all', pkg: '4', agent: 'all', payoff: 'all', departure: '2026-09', page: 3, pageSize: 50 });
// Invalid page/size fall back.
assert.strictEqual(prospectListStateFromParams(new URLSearchParams('page=abc&size=7'), SIZES).page, 1);
assert.strictEqual(prospectListStateFromParams(new URLSearchParams('page=-4'), SIZES).page, 1);
assert.strictEqual(prospectListStateFromParams(new URLSearchParams('size=7'), SIZES).pageSize, 25);
// Sidebar "Prospek" (/prospects) while on Closing page 3: differs, so the screen resets to the URL.
assert.strictEqual(sameProspectListState(s, defaults), false);
assert.strictEqual(sameProspectListState(s, { ...s }), true);

// --- "Rencana berangkat" options ---
const label = (m) => `L${m}`;
const upcoming = [{ value: '2026-10', label: 'Okt' }, { value: '2026-11', label: 'Nov' }];
const opts = withExtraDepartureMonths(upcoming, ['2026-08', 'all', null, undefined, '2026-10', '2026-13', '2026-08', '2025-12'], label);
assert.deepStrictEqual(opts.map((o) => o.value), ['2025-12', '2026-08', '2026-10', '2026-11']);
assert.strictEqual(opts.find((o) => o.value === '2026-08').label, 'L2026-08');
assert.strictEqual(opts.find((o) => o.value === '2026-10').label, 'Okt');
assert.deepStrictEqual(withExtraDepartureMonths(upcoming, [], label), upcoming);

// --- Affiliator payout rule (home button = Komisi page) ---
const rp = (n) => `Rp ${n}`;
const bank = { bank_name: 'BCA', bank_account_number: '123', bank_account_holder: 'Ani' };
const ok = { affiliator: bank, balance: { available: 200000, requested: 0 }, min_payout: 100000 };
assert.deepStrictEqual(affiliatorPayoutState(ok, rp), { canRequest: true, reason: null });
assert.strictEqual(affiliatorPayoutState({ ...ok, affiliator: { ...bank, bank_account_holder: '  ' } }, rp).canRequest, false);
assert.strictEqual(affiliatorPayoutState({ ...ok, affiliator: { ...bank, bank_name: null } }, rp).reason, 'Lengkapi rekening di menu Akun sebelum mengajukan pencairan.');
assert.deepStrictEqual(affiliatorPayoutState({ ...ok, balance: { available: 200000, requested: 50000 } }, rp), { canRequest: false, reason: 'Pencairan sebelumnya masih diproses tim KlikUmroh.' });
assert.deepStrictEqual(affiliatorPayoutState({ ...ok, balance: { available: 50000, requested: 0 } }, rp), { canRequest: false, reason: 'Minimal pencairan Rp 100000.' });
assert.strictEqual(affiliatorPayoutState({ ...ok, balance: { available: 0, requested: 0 }, min_payout: 0 }, rp).canRequest, false);
assert.strictEqual(hasBankDetails({ bank_name: ' BCA ', bank_account_number: '1', bank_account_holder: 'x' }), true);
assert.strictEqual(hasBankDetails({}), false);

console.log('session-ledger-filters tests passed');
