import assert from 'node:assert';
import { fillTravelVars } from '../src/screens/playbook/templateVars.ts';
import { primaryCustomHost, siteBaseUrl } from '../src/app/siteUrl.ts';

const vars = { name: 'Ibrahim Tours', recruitLink: 'https://ibrahim.klikumroh.id/agen/daftar', ppiu: '123/2026' };

// The travel-level placeholders are filled, every time they appear.
assert.strictEqual(fillTravelVars('Halo dari [Nama Travel]. [Nama Travel] siap.', vars), 'Halo dari Ibrahim Tours. Ibrahim Tours siap.');
assert.strictEqual(fillTravelVars('Daftar: [tautan halaman daftar agen]', vars), 'Daftar: https://ibrahim.klikumroh.id/agen/daftar');
assert.strictEqual(fillTravelVars('Daftar: [tautan halaman daftar agen travel Anda].', vars), 'Daftar: https://ibrahim.klikumroh.id/agen/daftar.');
assert.strictEqual(fillTravelVars('izin PPIU [nomor]', vars), 'izin PPIU 123/2026');

// A PPIU number typed with its own "PPIU" or "No." is not doubled.
assert.strictEqual(fillTravelVars('izin PPIU [nomor]', { ppiu: 'PPIU 123/2026' }), 'izin PPIU 123/2026');
assert.strictEqual(fillTravelVars('izin PPIU [nomor]', { ppiu: 'No. 123/2026' }), 'izin PPIU 123/2026');

// The reader's own placeholders stay, and "[Nama]" is not mistaken for "[Nama Travel]".
assert.strictEqual(fillTravelVars('Bapak/Ibu [Nama], [angka], [tautan referral]', vars), 'Bapak/Ibu [Nama], [angka], [tautan referral]');
assert.strictEqual(fillTravelVars('[Nama] dari [Nama Travel]', vars), '[Nama] dari Ibrahim Tours');

// Missing data never produces an empty hole: the placeholder stays for the reader.
assert.strictEqual(fillTravelVars('[Nama Travel] [nomor] [tautan halaman daftar agen]', {}), '[Nama Travel] [nomor] [tautan halaman daftar agen]');
assert.strictEqual(fillTravelVars('[nomor]', { ppiu: '   ' }), '[nomor]');
assert.strictEqual(fillTravelVars('[Nama Travel]', { name: null }), '[Nama Travel]');

// Link host: the primary custom domain when active and healthy, otherwise none (the caller uses the subdomain).
const sub = { hostname: 'ibrahim.klikumroh.id', type: 'subdomain', status: 'active' };
const primary = { hostname: 'WWW.Ibrahim.com', type: 'custom', status: 'active', redirect_to_domain_id: null, check_failures: 0 };
const alias = { hostname: 'ibrahim.com', type: 'custom', status: 'active', redirect_to_domain_id: 7 };
assert.strictEqual(primaryCustomHost([sub]), null);
assert.strictEqual(primaryCustomHost([]), null);
assert.strictEqual(primaryCustomHost([sub, alias, primary]), 'www.ibrahim.com'); // lower-cased, alias skipped
assert.strictEqual(primaryCustomHost([sub, { ...primary, status: 'pending' }]), null);
assert.strictEqual(primaryCustomHost([sub, { ...primary, status: 'failed' }]), null);
assert.strictEqual(primaryCustomHost([sub, { ...primary, check_failures: 2 }]), 'www.ibrahim.com');
assert.strictEqual(primaryCustomHost([sub, { ...primary, check_failures: 3 }]), null); // redirect stopped
assert.strictEqual(primaryCustomHost([sub, alias]), null);

// Base URL of the website: custom domain in production, subdomain otherwise, never a custom domain locally.
assert.strictEqual(siteBaseUrl('ibrahim', 'www.ibrahim.com', 'klikumroh.id'), 'https://www.ibrahim.com');
assert.strictEqual(siteBaseUrl('ibrahim', null, 'klikumroh.id'), 'https://ibrahim.klikumroh.id');
assert.strictEqual(siteBaseUrl('ibrahim', 'www.ibrahim.com', 'localhost'), 'http://ibrahim.localhost:3000');
assert.strictEqual(siteBaseUrl('ibrahim', null, '127.0.0.1'), 'http://ibrahim.localhost:3000');
assert.strictEqual(siteBaseUrl(null, null, 'klikumroh.id'), null);
assert.strictEqual(siteBaseUrl(undefined, 'www.ibrahim.com', 'klikumroh.id'), 'https://www.ibrahim.com');

console.log('playbook-vars: ok');
