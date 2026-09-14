import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomePackages } from '../components/home-package-selection.ts';

const packages = [
  { id: 1, name: 'Umroh Plus Turki', price: 43500000, departure_date: '2026-11-25T00:00:00Z' },
  { id: 2, name: 'Umroh Desember', price: 32500000, departure_date: '2026-12-20T00:00:00Z' },
  { id: 3, name: 'Umroh Hemat', price: null, departure_date: null },
  { id: 4, name: 'Umroh Plus Turki 9 Hari', price: 35500000, departure_date: '2027-02-25T00:00:00Z' },
];
const ids = (list) => list.map(({ id }) => id);
test('Search matches all words regardless of casing or word order', () => {
  assert.deepEqual(ids(selectHomePackages(packages, ' TURKI  umroh ', '', 'default')), [1, 4]);
});
test('Month combines with search and excludes missing departures', () => {
  assert.deepEqual(ids(selectHomePackages(packages, 'turki', '2027-02', 'default')), [4]);
});
test('Price sorting puts unknown prices last and leaves source unchanged', () => {
  assert.deepEqual(ids(selectHomePackages(packages, '', '', 'price')), [2, 4, 1, 3]);
  assert.deepEqual(ids(packages), [1, 2, 3, 4]);
});
test('Departure sorting puts unscheduled packages last', () => {
  assert.deepEqual(ids(selectHomePackages(packages, '', '', 'departure')), [1, 2, 4, 3]);
});
test('No matches returns empty results without silently showing unrelated packages', () => {
  assert.deepEqual(selectHomePackages(packages, 'ramadhan', '', 'price'), []);
});
test('Reset values return all packages in their original order', () => {
  assert.deepEqual(ids(selectHomePackages(packages, '', '', 'default')), [1, 2, 3, 4]);
});
