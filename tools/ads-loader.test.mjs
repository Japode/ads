// The snippet's attribute contract, tested against the file the domain actually serves.
//
// site/v1/ads.js is evaluated in a vm with a minimal fake document rather than imported
// from a copy: the published artifact is the contract, and a test that agrees with a
// parallel implementation proves nothing about what a host page downloads.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'site/v1/ads.js'), 'utf8');

/**
 * A fake element carrying exactly the attributes given.
 *
 * `shadow: false` models a browser with no shadow DOM, which the loader must treat as a
 * reason to stay empty rather than to draw unprotected.
 */
function el(attrs, { shadow = true } = {}) {
  const node = {
    attrs,
    shadowRoot: null,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
  };
  if (shadow) {
    node.attachShadow = function (init) {
      assert.equal(init.mode, 'open', 'the slot root is open so a site owner can inspect it');
      this.shadowRoot = { mode: init.mode, host: this, children: [] };
      return this.shadowRoot;
    };
  }
  return node;
}

/** A fetch that answers the catalogue, or fails, without touching the network. */
function fakeFetch(answer) {
  const calls = [];
  const fn = url => {
    calls.push(url);
    return answer(url);
  };
  fn.calls = calls;
  return fn;
}

const jsonResponse = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

/**
 * Evaluate the served loader against a page made of `containers`, and return what it
 * exposed plus anything it warned about.
 *
 * `pageLang` is what <html lang> says; `containers` are the elements a real
 * querySelectorAll would return for the marker.
 */
function run(containers, { pageLang, fetch, scriptSrc = 'https://ads.japode.com/v1/ads.js' } = {}) {
  const warnings = [];
  const fetchFn = fetch ?? fakeFetch(() => jsonResponse({ version: 1, campaigns: [] }));
  const document = {
    readyState: 'complete',
    currentScript: { src: scriptSrc },
    documentElement: el(pageLang === undefined ? {} : { lang: pageLang }),
    querySelectorAll(selector) {
      assert.equal(selector, '[data-japode-ads]', 'the marker selector is part of the contract');
      return containers;
    },
    addEventListener() {
      assert.fail('a complete document must not wait for DOMContentLoaded');
    },
  };
  const context = { document, console: { warn: m => warnings.push(m) }, fetch: fetchFn, URL };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'ads.js' });

  // Values built inside the vm carry that realm's prototypes, which deepStrictEqual
  // compares. Cross the boundary as plain data so the assertions are about the contract
  // and not about which realm made the array.
  const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    get exposed() { return plain(context.japodeAds); },
    warnings,
    fetches: fetchFn.calls ?? [],
    containers,
    internals: context.__japodeAdsInternals,
    formats: plain(context.__japodeAdsInternals.FORMATS),
    /** Let the one catalogue request settle. */
    settled: () => new Promise(r => setTimeout(r, 0)),
  };
}

test('the minimal paste is a working slot', () => {
  // <div data-japode-ads></div> and nothing else. If this needs an attribute to work,
  // the product is not one copy-paste block.
  const { exposed, warnings } = run([el({ 'data-japode-ads': '' })]);
  assert.equal(exposed.version, 1);
  assert.equal(exposed.slots.length, 1);
  assert.deepEqual(exposed.slots[0], {
    slot: 'in-content-1',
    format: 'in-content',
    theme: 'auto',
    lang: '',
    tags: [],
    exclude: [],
    isolated: true,
    warnings: [],
  });
  assert.deepEqual(warnings, [], 'a bare paste must not warn');
});

test('every documented attribute is read', () => {
  const { exposed } = run([
    el({
      'data-japode-ads': '',
      'data-ad-format': 'sidebar',
      'data-ad-slot': 'rail-top',
      'data-ad-theme': 'dark',
      'data-ad-lang': 'pt-BR',
      'data-ad-tags': 'devtools, cms ,',
      'data-ad-exclude': 'roadkeep,shio',
    }),
  ]);
  assert.deepEqual(exposed.slots[0], {
    slot: 'rail-top',
    format: 'sidebar',
    theme: 'dark',
    lang: 'pt-BR',
    tags: ['devtools', 'cms'],
    exclude: ['roadkeep', 'shio'],
    isolated: true,
    warnings: [],
  });
});

test('an unknown format warns and still renders on the default', () => {
  // The site owner typed it and is not watching their console; the reader should not
  // lose the banner over it.
  const { exposed, warnings } = run([el({ 'data-japode-ads': '', 'data-ad-format': 'sidbar' })]);
  assert.equal(exposed.slots[0].format, 'in-content');
  assert.equal(exposed.slots[0].warnings.length, 1);
  assert.match(warnings[0], /data-ad-format="sidbar" is not one of/);
});

test('an unknown theme warns and still renders on the default', () => {
  const { exposed, warnings } = run([el({ 'data-japode-ads': '', 'data-ad-theme': 'neon' })]);
  assert.equal(exposed.slots[0].theme, 'auto');
  assert.match(warnings[0], /data-ad-theme="neon" is not one of/);
});

test('an unknown attribute is ignored, not fatal', () => {
  // A v2 snippet pasted at a v1 URL, or a typo. Either way the slot still works.
  const { exposed, warnings } = run([
    el({ 'data-japode-ads': '', 'data-ad-frequency': '3', 'data-something-else': 'x' }),
  ]);
  assert.equal(exposed.slots.length, 1);
  assert.equal(exposed.slots[0].format, 'in-content');
  assert.deepEqual(warnings, []);
});

test('a slot with no lang inherits the page language', () => {
  const { exposed } = run([el({ 'data-japode-ads': '' })], { pageLang: 'pt-BR' });
  assert.equal(exposed.slots[0].lang, 'pt-BR');
});

test('an explicitly empty lang opts out of the page language', () => {
  // Absent and empty are different answers: inherit, versus accept any language.
  const { exposed } = run([el({ 'data-japode-ads': '', 'data-ad-lang': '' })], { pageLang: 'pt-BR' });
  assert.equal(exposed.slots[0].lang, '');
});

test('several slots on one page get distinct stable names', () => {
  const { exposed } = run([
    el({ 'data-japode-ads': '' }),
    el({ 'data-japode-ads': '', 'data-ad-format': 'sidebar' }),
    el({ 'data-japode-ads': '', 'data-ad-format': 'sidebar' }),
  ]);
  assert.deepEqual(
    exposed.slots.map(s => s.slot),
    ['in-content-1', 'sidebar-2', 'sidebar-3']
  );
});

test('a page with no containers exposes an empty list, not an error', () => {
  const { exposed, warnings } = run([]);
  assert.deepEqual(exposed.slots, []);
  assert.deepEqual(warnings, []);
});

test('the loader waits when the document is still parsing', () => {
  // An async script can arrive either side of parsing; arriving early must not mean
  // finding no containers and giving up.
  let waited = false;
  const document = {
    readyState: 'loading',
    documentElement: el({}),
    querySelectorAll: () => assert.fail('must not read the document while it is parsing'),
    addEventListener(type) {
      assert.equal(type, 'DOMContentLoaded');
      waited = true;
    },
  };
  const context = { document, console: { warn() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'ads.js' });
  assert.equal(waited, true);
  assert.equal(context.japodeAds, undefined, 'nothing is exposed before the slots are read');
});

// ------------------------------------------------------------------------------------
// Isolation and the one request
// ------------------------------------------------------------------------------------

test('many slots cost one catalogue request', async () => {
  const h = run([
    el({ 'data-japode-ads': '' }),
    el({ 'data-japode-ads': '', 'data-ad-format': 'sidebar' }),
    el({ 'data-japode-ads': '', 'data-ad-format': 'footer' }),
  ]);
  await h.settled();
  assert.equal(h.fetches.length, 1, 'three slots, one request');
});

test('a page with the script and no container makes no request', async () => {
  const h = run([]);
  await h.settled();
  assert.deepEqual(h.fetches, [], 'a script on a page with no slot must cost nothing');
});

test('the catalogue is requested with a bucketed cache-busting token', async () => {
  const h = run([el({ 'data-japode-ads': '' })]);
  await h.settled();
  const url = new URL(h.fetches[0]);
  assert.equal(url.pathname, '/v1/catalogue.json');
  const v = Number(url.searchParams.get('v'));
  const { CACHE_SECONDS } = h.internals;
  // Bucketed, not unique: every reader inside the window shares one URL, so it still
  // caches. A per-view token would make every request a full round trip.
  assert.equal(v, Math.floor(Date.now() / (CACHE_SECONDS * 1000)));
});

test('the loader fetches from the origin it was served from', async () => {
  // A local preview copy must read the catalogue beside it, not production.
  const h = run([el({ 'data-japode-ads': '' })], { scriptSrc: 'http://localhost:8080/v1/ads.js' });
  await h.settled();
  assert.match(h.fetches[0], /^http:\/\/localhost:8080\/v1\/catalogue\.json\?v=\d+$/);
});

test('a failed request collapses to the empty response instead of rejecting', async () => {
  // An unhandled rejection would land in someone else's page console.
  const h = run([el({ 'data-japode-ads': '' })], {
    fetch: fakeFetch(() => Promise.reject(new Error('offline'))),
  });
  await h.settled();
  assert.equal(h.exposed.campaigns, 0);
});

test('a non-ok response collapses to the empty response', async () => {
  const h = run([el({ 'data-japode-ads': '' })], {
    fetch: fakeFetch(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })),
  });
  await h.settled();
  assert.equal(h.exposed.campaigns, 0);
});

test('a payload from a version this script cannot read collapses to empty', async () => {
  // /v1/ is supposed to answer v1 forever; if it ever does not, a v1 loader must not
  // try to draw a shape it does not understand.
  const h = run([el({ 'data-japode-ads': '' })], {
    fetch: fakeFetch(() => jsonResponse({ version: 2, campaigns: [{ id: 'x' }] })),
  });
  await h.settled();
  assert.equal(h.exposed.campaigns, 0);
});

test('a readable catalogue reports how many campaigns arrived', async () => {
  const h = run([el({ 'data-japode-ads': '' })], {
    fetch: fakeFetch(() => jsonResponse({ version: 1, campaigns: [{ id: 'a' }, { id: 'b' }] })),
  });
  assert.equal(h.exposed.campaigns, null, 'null until the request settles');
  await h.settled();
  assert.equal(h.exposed.campaigns, 2);
});

test('every slot gets its own open shadow root', () => {
  const h = run([el({ 'data-japode-ads': '' }), el({ 'data-japode-ads': '' })]);
  for (const c of h.containers) {
    assert.ok(c.shadowRoot, 'the banner is drawn inside a root the host stylesheet cannot reach');
    assert.equal(c.shadowRoot.mode, 'open');
  }
  assert.deepEqual(h.exposed.slots.map(s => s.isolated), [true, true]);
});

test('without shadow DOM the slot stays empty rather than draw unprotected', () => {
  const h = run([el({ 'data-japode-ads': '' }, { shadow: false })]);
  assert.equal(h.exposed.slots[0].isolated, false);
  assert.match(h.warnings[0], /no shadow DOM, so the slot stays empty/);
});

test('the three formats match the catalogue schema exactly', () => {
  // The snippet and the catalogue name the same layout families or a slot can ask for
  // something no campaign can ever fill.
  const schema = JSON.parse(readFileSync(join(root, 'schema/v1/catalogue.schema.json'), 'utf8'));
  const { formats } = run([]);
  assert.deepEqual(formats.slice().sort(), schema.$defs.slot.enum.slice().sort());
});
