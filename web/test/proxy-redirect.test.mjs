import assert from 'node:assert';
import { NextRequest } from 'next/server.js';
import { proxy } from '../proxy.ts';

// Helper for visual character-by-character comparison table
function printCharByCharComparison(original, redirected) {
  console.log('\n--- DETAIL KOMPARASI KARAKTER-PER-KARAKTER ---');
  console.log(`Original Path + Query  : "${original}" (length: ${original.length})`);
  console.log(`Redirect Path + Query  : "${redirected}" (length: ${redirected.length})`);
  console.log('Pos | Char Asli | Char Redirect | Match?');
  console.log('----+-----------+---------------+-------');

  const maxLen = Math.max(original.length, redirected.length);
  let allMatched = true;

  for (let i = 0; i < maxLen; i++) {
    const c1 = i < original.length ? original[i] : '(end)';
    const c2 = i < redirected.length ? redirected[i] : '(end)';
    const match = c1 === c2;
    if (!match) allMatched = false;
    const matchStr = match ? 'MATCH' : 'MISMATCH';
    console.log(`${String(i).padStart(3, ' ')} | ${String(c1).padEnd(9, ' ')} | ${String(c2).padEnd(13, ' ')} | ${matchStr}`);
  }
  console.log('----+-----------+---------------+-------');
  console.log(`Hasil Komparasi Karakter: ${allMatched ? 'IDENTIK 100%' : 'ADA PERBEDAAN'}\n`);
  return allMatched;
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING TEST: Next.js Proxy Subdomain -> Custom Domain Redirect');
  console.log('================================================================\n');

  const globalFetch = globalThis.fetch;

  try {
    // --------------------------------------------------------------------------
    // Skenario A: Subdomain dengan path + query kompleks -> Custom Domain ACTIVE
    // --------------------------------------------------------------------------
    console.log('[SKENARIO A] Request ke subdomain dengan custom domain aktif');
    const inputUrl = 'http://travela.klikumroh.id/paket/9?ref=HANAFI&utm_source=wa';
    const originalUrlObj = new URL(inputUrl);
    const originalPathAndQuery = originalUrlObj.pathname + originalUrlObj.search;

    console.log(`Incoming URL      : ${inputUrl}`);
    console.log(`Host              : travela.klikumroh.id`);
    console.log(`Path & Query Asli : ${originalPathAndQuery}`);

    // Mock backend returning active custom domain
    globalThis.fetch = async (url) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          custom_domain: 'umroh-travela.com',
          status: 'active',
        }),
      };
    };

    const reqA = new NextRequest(inputUrl, {
      headers: {
        host: 'travela.klikumroh.id',
        'x-forwarded-host': 'travela.klikumroh.id',
      },
    });

    const resA = await proxy(reqA);
    const redirectStatus = resA.status;
    const locationHeader = resA.headers.get('location');

    console.log(`Response Status   : ${redirectStatus}`);
    console.log(`Location Header   : ${locationHeader}`);

    // 307, not 301: a permanent redirect would stay cached in browsers after the custom domain is removed.
    assert.strictEqual(redirectStatus, 307, 'Status redirect harus 307 Temporary Redirect');
    assert(locationHeader, 'Location header harus terisi');

    const redirectUrlObj = new URL(locationHeader);
    const redirectPathAndQuery = redirectUrlObj.pathname + redirectUrlObj.search;

    assert.strictEqual(redirectUrlObj.protocol, 'https:', 'Protocol redirect harus https:');
    assert.strictEqual(redirectUrlObj.hostname, 'umroh-travela.com', 'Hostname redirect harus custom domain tujuan');

    const isIdentical = printCharByCharComparison(originalPathAndQuery, redirectPathAndQuery);
    assert.strictEqual(isIdentical, true, 'Path dan Query string wajib identik karakter-per-karakter');
    console.log('[SKENARIO A PASSED] Redirect 307 sukses dan path + query utuh 100%.\n');

    // --------------------------------------------------------------------------
    // Skenario B: Subdomain dengan path + query kompleks -> Custom Domain PENDING
    // --------------------------------------------------------------------------
    console.log('[SKENARIO B] Request ke subdomain dengan custom domain masih pending/gagal');
    console.log(`Incoming URL      : ${inputUrl}`);
    console.log(`Host              : travela.klikumroh.id`);

    // Mock backend returning pending (null custom domain)
    globalThis.fetch = async (url) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          custom_domain: null,
          status: 'pending',
        }),
      };
    };

    const reqB = new NextRequest(inputUrl, {
      headers: {
        host: 'travela.klikumroh.id',
        'x-forwarded-host': 'travela.klikumroh.id',
      },
    });

    const resB = await proxy(reqB);
    const statusB = resB.status;
    const locationB = resB.headers.get('location');

    console.log(`Response Status   : ${statusB}`);
    console.log(`Location Header   : ${locationB}`);

    assert.notStrictEqual(statusB, 307, 'Request TIDAK BOLEH di-redirect');
    assert.strictEqual(locationB, null, 'Location header harus null (tidak ada redirect)');
    console.log('[SKENARIO B PASSED] Tidak ada redirect (subdomain tetap melayani request normal).\n');

    // --------------------------------------------------------------------------
    // Skenario C: alias domain (tanpa www) -> domain utama www, 307, path + query utuh
    // --------------------------------------------------------------------------
    console.log('[SKENARIO C] Request ke alias namatravel.com dengan domain utama www aktif');
    const aliasUrl = 'https://namatravel.com/paket/12?ref=AGEN01&utm_campaign=promo';
    let askedHost = null;
    globalThis.fetch = async (url) => {
      askedHost = new URL(url).searchParams.get('host');
      return { ok: true, status: 200, json: async () => ({ custom_domain: 'www.namatravel.com' }) };
    };
    const resC = await proxy(new NextRequest(aliasUrl, { headers: { host: 'namatravel.com', 'x-forwarded-host': 'namatravel.com' } }));
    const locC = resC.headers.get('location');
    console.log('Response Status   : ' + resC.status);
    console.log('Location Header   : ' + locC);
    assert.strictEqual(askedHost, 'namatravel.com', 'Proxy harus menanyakan target untuk host domain sendiri');
    assert.strictEqual(resC.status, 307, 'Alias harus di-redirect 307');
    const locCUrl = new URL(locC);
    assert.strictEqual(locCUrl.hostname, 'www.namatravel.com', 'Tujuan harus domain utama www');
    assert.strictEqual(locCUrl.protocol, 'https:', 'Protocol redirect harus https:');
    const aliasPath = new URL(aliasUrl);
    assert.strictEqual(
      printCharByCharComparison(aliasPath.pathname + aliasPath.search, locCUrl.pathname + locCUrl.search),
      true,
      'Path + query alias wajib utuh',
    );
    console.log('[SKENARIO C PASSED] Alias diarahkan ke www dengan path + query utuh.\n');

    // --------------------------------------------------------------------------
    // Skenario D: domain utama (www) tidak di-redirect; host platform tidak menanyakan backend
    // --------------------------------------------------------------------------
    console.log('[SKENARIO D] Domain utama www dan host platform');
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ custom_domain: null }) };
    };
    const resD = await proxy(new NextRequest('https://www.namatravel.com/?ref=AGEN01', { headers: { host: 'www.namatravel.com' } }));
    assert.strictEqual(resD.headers.get('location'), null, 'Domain utama tidak boleh di-redirect');
    const callsBefore = calls;
    const resE = await proxy(new NextRequest('https://klikumroh.id/', { headers: { host: 'klikumroh.id' } }));
    assert.strictEqual(resE.headers.get('location'), null, 'Host platform tidak boleh di-redirect');
    assert.strictEqual(calls, callsBefore, 'Host platform tidak perlu menanyakan backend');
    console.log('[SKENARIO D PASSED] Domain utama dan host platform tetap melayani request.\n');

    console.log('================================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY (4 of 4)');
    console.log('================================================================');
  } finally {
    globalThis.fetch = globalFetch;
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
