import assert from 'node:assert';
import { hostField, isRoot, pairOf, zoneOf } from '../src/screens/website/domainZone.ts';

// Plain .id names whose label merely ends in "co"/"net"/"my" are two-label zones, not namatravel.co.id style.
for (const host of ['mentor.id', 'travelnet.id', 'travelco.id', 'mymy.id']) {
  assert.strictEqual(zoneOf(host), host, `zoneOf(${host})`);
  assert.strictEqual(isRoot(host), true, `isRoot(${host})`);
  assert.deepStrictEqual(pairOf(host), { primary: 'www.' + host, alias: host }, `pairOf(${host})`);
}

// www.mentor.id: CNAME on "www", TXT host relative to mentor.id, pair not doubled to www.www.
assert.strictEqual(zoneOf('www.mentor.id'), 'mentor.id');
assert.strictEqual(isRoot('www.mentor.id'), false);
assert.deepStrictEqual(pairOf('www.mentor.id'), { primary: 'www.mentor.id', alias: 'mentor.id' });
assert.strictEqual(hostField('www.mentor.id', 'mentor.id'), 'www');
assert.strictEqual(hostField('mentor.id', 'mentor.id'), '@');
assert.strictEqual(hostField('_klikumroh-verify.www.mentor.id', 'mentor.id'), '_klikumroh-verify.www');
assert.strictEqual(hostField('_klikumroh-verify.www.travelnet.id', zoneOf('www.travelnet.id')), '_klikumroh-verify.www');

// Indonesian second-level zones keep three labels.
assert.strictEqual(zoneOf('namatravel.co.id'), 'namatravel.co.id');
assert.strictEqual(isRoot('namatravel.co.id'), true);
assert.deepStrictEqual(pairOf('namatravel.co.id'), { primary: 'www.namatravel.co.id', alias: 'namatravel.co.id' });
assert.strictEqual(zoneOf('www.namatravel.co.id'), 'namatravel.co.id');
assert.strictEqual(isRoot('www.namatravel.co.id'), false);
assert.deepStrictEqual(pairOf('www.namatravel.co.id'), { primary: 'www.namatravel.co.id', alias: 'namatravel.co.id' });
assert.strictEqual(hostField('www.namatravel.co.id', 'namatravel.co.id'), 'www');
assert.strictEqual(zoneOf('travel.ponpes.id'), 'travel.ponpes.id');

// .com
assert.strictEqual(zoneOf('namatravel.com'), 'namatravel.com');
assert.strictEqual(isRoot('namatravel.com'), true);
assert.deepStrictEqual(pairOf('namatravel.com'), { primary: 'www.namatravel.com', alias: 'namatravel.com' });
assert.strictEqual(zoneOf('www.namatravel.com'), 'namatravel.com');
assert.strictEqual(isRoot('www.namatravel.com'), false);
assert.deepStrictEqual(pairOf('www.namatravel.com'), { primary: 'www.namatravel.com', alias: 'namatravel.com' });

// Neither www nor root, and a bare suffix, give no pair.
assert.strictEqual(pairOf('umroh.namatravel.com'), null);
assert.strictEqual(pairOf('umroh.namatravel.co.id'), null);
assert.strictEqual(pairOf('co.id'), null);
assert.strictEqual(pairOf('not a host'), null);

console.log('domain-zone: ok');
