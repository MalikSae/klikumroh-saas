import assert from 'node:assert';
import { parsePercent, parseRupiah } from '../src/screens/programs/numberInput.ts';

// Aturan agen form: the override percentage must not be read as a Rupiah amount (2.5% used to save as 25%).
assert.strictEqual(parsePercent('2.5'), 2.5);
assert.strictEqual(parsePercent('2,5'), 2.5);
assert.strictEqual(parsePercent('12.5'), 12.5);
assert.strictEqual(parsePercent(String(2.5)), 2.5); // a stored value loaded back into the field
assert.strictEqual(parsePercent(' 10 '), 10);
assert.strictEqual(parsePercent(''), null);
assert.strictEqual(parsePercent('abc'), null);

// Rupiah amounts keep dots as thousands separators.
assert.strictEqual(parseRupiah('100.000'), 100000);
assert.strictEqual(parseRupiah('1.250.000'), 1250000);
assert.strictEqual(parseRupiah('50000'), 50000);
assert.strictEqual(parseRupiah(''), null);
assert.strictEqual(parseRupiah('   '), null);
assert.strictEqual(parseRupiah(' 150.000 '), 150000);
assert.strictEqual(parseRupiah('150000'), 150000);
assert.strictEqual(parseRupiah('0'), 0);
assert.strictEqual(parseRupiah('150.000,50'), 150000.5);
assert.strictEqual(parseRupiah(String(250000)), 250000); // a stored value loaded back into the field

// Not a clean Rupiah number: reported as invalid (an error is shown), never silently saved as "not set".
for (const bad of ['150.000,-', '1,500,000', '150rb', 'Rp150.000', '1.5', '1.50.000', '15.0000', '-5', 'abc', '150 000', '.500', '150.']) {
  assert.strictEqual(parseRupiah(bad), 'invalid', `expected invalid for ${JSON.stringify(bad)}`);
}

console.log('number-input: all assertions passed');
