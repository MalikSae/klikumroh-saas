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

console.log('number-input: all assertions passed');
