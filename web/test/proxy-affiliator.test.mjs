import assert from 'node:assert';
import { NextRequest } from 'next/server.js';
import { proxy } from '../proxy.ts';

// Affiliator KlikUmroh link (?aff=CODE): cookie ku_aff on platform hosts only, one click logged per code.
async function run() {
  const globalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    if (String(url).includes('custom-domain-target')) {
      return new Response('{}', { status: 404 });
    }
    return new Response(null, { status: 204 });
  };

  const req = (url, cookie) => {
    const headers = new Headers({ host: new URL(url).host });
    if (cookie) headers.set('cookie', cookie);
    return new NextRequest(url, { headers });
  };
  const affCookie = (res) => res.cookies.get('ku_aff');
  const clickCalls = () => calls.filter((c) => c.url.endsWith('/api/public/affiliator-clicks'));

  try {
    // 1. Platform host with a valid code: cookie (upper-cased, 60 days) + one click logged.
    let res = await proxy(req('http://localhost:3000/?aff=abcd2345&utm_source=ig'));
    assert.strictEqual(affCookie(res)?.value, 'ABCD2345');
    assert.strictEqual(affCookie(res)?.maxAge, 60 * 60 * 24 * 60);
    assert.strictEqual(clickCalls().length, 1);
    assert.deepStrictEqual(JSON.parse(clickCalls()[0].body), { code: 'ABCD2345' });
    console.log('OK 1: platform host sets ku_aff and logs a click');

    // 2. Same code already remembered: cookie refreshed, no second click.
    res = await proxy(req('http://localhost:3000/?aff=ABCD2345', 'ku_aff=ABCD2345'));
    assert.strictEqual(affCookie(res)?.value, 'ABCD2345');
    assert.strictEqual(clickCalls().length, 1);
    console.log('OK 2: repeat visit with the same code does not log another click');

    // 3. Another affiliator's link: last link wins, new click logged.
    res = await proxy(req('http://localhost:3000/?aff=ZZZZ9999', 'ku_aff=ABCD2345'));
    assert.strictEqual(affCookie(res)?.value, 'ZZZZ9999');
    assert.strictEqual(clickCalls().length, 2);
    console.log('OK 3: a different link replaces the cookie');

    // 4. Invalid code: nothing stored or logged.
    res = await proxy(req('http://localhost:3000/?aff=x%3Cscript%3E'));
    assert.strictEqual(affCookie(res), undefined);
    assert.strictEqual(clickCalls().length, 2);
    console.log('OK 4: invalid code ignored');

    // 5. Travel host (whitelabel): never an affiliator cookie.
    res = await proxy(req('http://demo.localhost:3000/?aff=ABCD2345'));
    assert.strictEqual(affCookie(res), undefined);
    assert.strictEqual(clickCalls().length, 2);
    console.log('OK 5: travel subdomain ignores ?aff=');

    // 6. Backend down: page still served, cookie still set.
    globalThis.fetch = async () => {
      throw new Error('backend down');
    };
    res = await proxy(req('http://localhost:3000/?aff=DOWN1234'));
    assert.strictEqual(affCookie(res)?.value, 'DOWN1234');
    console.log('OK 6: click logging failure does not break the page');

    console.log('ALL AFFILIATOR PROXY TESTS PASSED (6 of 6)');
  } finally {
    globalThis.fetch = globalFetch;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
