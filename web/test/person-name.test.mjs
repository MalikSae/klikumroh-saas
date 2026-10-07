import test from 'node:test';
import assert from 'node:assert/strict';

import { capitalizeName } from '../lib/personName.ts';

test('capitalizes the first letter of every word while typing', () => {
  const cases = [
    ['joko', 'Joko'],
    ['joko susilo', 'Joko Susilo'],
    ['joko ', 'Joko '],
    ['siti nur-aini', 'Siti Nur-Aini'],
    ["ma'ruf amin", "Ma'ruf Amin"],
    ['h. ahmad subagio', 'H. Ahmad Subagio'],
    ['', ''],
  ];
  for (const [input, want] of cases) assert.equal(capitalizeName(input), want, input);
});

test('leaves the rest of the name as typed', () => {
  assert.equal(capitalizeName('McDonald'), 'McDonald');
  assert.equal(capitalizeName('AHMAD FAUZI'), 'AHMAD FAUZI');
  assert.equal(capitalizeName('muhammad aLI'), 'Muhammad ALI');
});
