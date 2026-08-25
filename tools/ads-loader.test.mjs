// The snippet's attribute contract, tested against the file the domain actually serves.
//
// site/v1/ads.js is evaluated in a vm with a minimal fake document rather than imported
// from a copy: the published artifact is the contract, and a test that agrees with a
// parallel implementation proves nothing about what a host page downloads.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
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
      const root = fakeNode('#shadow-root');
      root.mode = init.mode;
      root.host = this;
      this.shadowRoot = root;
      return root;
    };
  }
  return node;
}

/**
 * The smallest node the renderer can build a banner out of: children, attributes and
 * textContent. Enough to assert what got drawn without pulling in a DOM library, and
 * small enough that a test failure points at the loader rather than at the fake.
 */
function fakeNode(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    children: [],
    attributes: {},
    _text: '',
    setAttribute(n, v) { this.attributes[n] = v; },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attributes, n) ? this.attributes[n] : null; },
    appendChild(c) { this.children.push(c); return c; },
    set textContent(v) { this._text = v; this.children = []; },
    get textContent() { return this._text; },
    /** Depth-first search for the first descendant with this class. */
    find(cls) {
      for (const c of this.children) {
        if (typeof c.className === 'string' && c.className.split(' ').includes(cls)) return c;
        const deeper = c.find && c.find(cls);
        if (deeper) return deeper;
      }
      return null;
    },
  };
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
function run(containers, { pageLang, fetch, scriptSrc = 'https://ads.japode.com/v1/ads.js', dark = false } = {}) {
  const warnings = [];
  const fetchFn = fetch ?? fakeFetch(() => jsonResponse({ version: 1, campaigns: [] }));
  const document = {
    readyState: 'complete',
    currentScript: { src: scriptSrc },
    createElement: fakeNode,
    documentElement: el(pageLang === undefined ? {} : { lang: pageLang }),
    querySelectorAll(selector) {
      assert.equal(selector, '[data-japode-ads]', 'the marker selector is part of the contract');
      return containers;
    },
    addEventListener() {
      assert.fail('a complete document must not wait for DOMContentLoaded');
    },
  };
  const context = {
    document,
    console: { warn: m => warnings.push(m) },
    fetch: fetchFn,
    URL,
    matchMedia: q => ({ matches: dark && q.includes('dark') }),
  };
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
    showing: null,
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
    showing: null,
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

// ------------------------------------------------------------------------------------
// The banner
// ------------------------------------------------------------------------------------

/** A campaign shaped exactly as the catalogue is, overridable per test. */
function campaign(over = {}) {
  return {
    id: 'roadkeep',
    product: 'roadkeep',
    logo: { src: '/logos/roadkeep.svg', srcDark: '/logos/roadkeep-dark.svg', alt: 'roadkeep', width: 160, height: 160 },
    headline: 'Your roadmap stops drifting',
    support: 'A CLI owns the roadmap, the changelog and the rationale.',
    cta: { label: 'Get roadkeep', href: 'https://github.com/alegauss/roadkeep' },
    theme: {
      light: { accent: '#b45309', onAccent: '#ffffff', surface: '#f8fafc', text: '#0f172a', muted: '#475569', border: '#e2e8f0' },
      dark: { accent: '#f59e0b', onAccent: '#1c1917', surface: '#0f172a', text: '#e2e8f0', muted: '#94a3b8', border: '#1e293b' },
    },
    ...over,
  };
}

const withCampaigns = (...cs) => fakeFetch(() => jsonResponse({ version: 1, campaigns: cs }));

test('a banner is assembled entirely from catalogue fields', async () => {
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();

  const root = container.shadowRoot;
  const link = root.find('unit');
  assert.ok(link, 'the unit is drawn inside the shadow root');
  assert.equal(link.tagName, 'A');
  assert.equal(link.getAttribute('href'), 'https://github.com/alegauss/roadkeep');
  assert.equal(root.find('product').textContent, 'roadkeep');
  assert.equal(root.find('headline').textContent, 'Your roadmap stops drifting');
  assert.equal(root.find('support').textContent, 'A CLI owns the roadmap, the changelog and the rationale.');
  assert.equal(root.find('cta').textContent, 'Get roadkeep');
  assert.equal(h.exposed.slots[0].showing, 'roadkeep');
});

test('the whole unit is one link, labelled by what it does', async () => {
  // Not logo-link, heading-link, button-link: a screen reader should meet the offer once.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  const link = container.shadowRoot.find('unit');
  assert.match(link.getAttribute('aria-label'), /Get roadkeep — roadkeep: Your roadmap stops drifting/);
  assert.equal(link.getAttribute('rel'), 'sponsored noopener');
  // The logo is decorative once the link is labelled; announcing it repeats the product.
  assert.equal(container.shadowRoot.find('logo').getAttribute('alt'), '');
});

test('the mark is never reshaped by the renderer', async () => {
  // border-radius clips an <img>. A logo carries the shape its owner chose, and the
  // ones with empty corners hide the damage for the ones that do not.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  const logoRules = styleOf(container).match(/\.logo \{[^}]*\}/g) ?? [];
  assert.ok(logoRules.length, 'the logo is styled at all');
  for (const rule of logoRules) {
    assert.doesNotMatch(rule, /border-radius|clip-path|object-fit: cover/, rule);
  }
});

test('the logo reserves its box before the file arrives', async () => {
  // The declared size is the whole reason the catalogue carries width and height.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  const img = container.shadowRoot.find('logo');
  assert.equal(img.getAttribute('width'), '160');
  assert.equal(img.getAttribute('height'), '160');
  assert.equal(img.getAttribute('src'), 'https://ads.japode.com/logos/roadkeep.svg');
});

test('a dark slot draws the dark tokens and the dark logo', async () => {
  const container = el({ 'data-japode-ads': '', 'data-ad-theme': 'dark' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  const root = container.shadowRoot;
  assert.equal(root.find('logo').getAttribute('src'), 'https://ads.japode.com/logos/roadkeep-dark.svg');
  assert.match(root.children[0].textContent, /#0f172a/, 'the dark surface token reaches the stylesheet');
});

test('auto follows the reader, not the host page', async () => {
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()), dark: true });
  await h.settled();
  assert.equal(container.shadowRoot.find('logo').getAttribute('src'), 'https://ads.japode.com/logos/roadkeep-dark.svg');
});

test('a campaign with no dark half falls back to its own light tokens', async () => {
  // Its light palette on a dark card is wrong but legible; a palette we inverted is not.
  const only = campaign();
  delete only.theme.dark;
  delete only.logo.srcDark;
  const container = el({ 'data-japode-ads': '', 'data-ad-theme': 'dark' });
  const h = run([container], { fetch: withCampaigns(only) });
  await h.settled();
  const root = container.shadowRoot;
  assert.equal(root.find('logo').getAttribute('src'), 'https://ads.japode.com/logos/roadkeep.svg');
  assert.match(root.children[0].textContent, /#f8fafc/, 'the light surface token is used rather than a guess');
});

test('the banner discloses that it is one', async () => {
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  assert.equal(container.shadowRoot.find('mark').textContent, 'Ad');
});

test('catalogue text is set as text, never as markup', async () => {
  // A campaign is data. Data that can introduce markup into a host page is an injection
  // whether or not we are the ones who wrote it.
  const container = el({ 'data-japode-ads': '' });
  const nasty = campaign({ headline: '<img src=x onerror=alert(1)>' });
  const h = run([container], { fetch: withCampaigns(nasty) });
  await h.settled();
  const headline = container.shadowRoot.find('headline');
  assert.equal(headline.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(headline.children.length, 0, 'the string stayed a string');
});

test('a withdrawn campaign is never drawn', async () => {
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], {
    fetch: withCampaigns(campaign({ id: 'cursarei', enabled: false }), campaign({ id: 'shio' })),
  });
  await h.settled();
  assert.equal(h.exposed.slots[0].showing, 'shio');
});

test('a catalogue with nothing eligible leaves the slot empty', async () => {
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign({ enabled: false })) });
  await h.settled();
  assert.equal(h.exposed.slots[0].showing, null);
  assert.equal(container.shadowRoot.find('unit'), null, 'no banner is drawn into the host page');
});

test('every slot on the page draws from the one response', async () => {
  const a = el({ 'data-japode-ads': '' });
  const b = el({ 'data-japode-ads': '', 'data-ad-format': 'sidebar' });
  const h = run([a, b], { fetch: withCampaigns(campaign()) });
  await h.settled();
  assert.equal(h.fetches.length, 1);
  assert.ok(a.shadowRoot.find('unit'), 'the first slot drew');
  assert.ok(b.shadowRoot.find('unit'), 'the second slot drew');
  assert.equal(b.shadowRoot.find('unit').className, 'unit sidebar', 'the format reaches the markup');
});

test('the real catalogue renders every campaign it carries', async () => {
  // The template is only done when it survives the data that actually ships: eight
  // brands, two languages, four logo shapes, one of them withdrawn.
  const live = JSON.parse(readFileSync(join(root, 'site/v1/catalogue.json'), 'utf8'));
  for (const c of live.campaigns.filter(x => x.enabled !== false)) {
    const container = el({ 'data-japode-ads': '' });
    const h = run([container], { fetch: withCampaigns(c) });
    await h.settled();
    const shadow = container.shadowRoot;
    assert.equal(h.exposed.slots[0].showing, c.id, `${c.id} should have drawn`);
    assert.equal(shadow.find('headline').textContent, c.headline);
    assert.equal(shadow.find('cta').textContent, c.cta.label);
    assert.equal(shadow.find('unit').getAttribute('href'), c.cta.href);
    assert.ok(shadow.find('logo').getAttribute('src').endsWith(c.logo.src));
  }
});

test('the formats match the catalogue schema exactly', () => {
  // The snippet and the catalogue name the same layout families or a slot can ask for
  // something no campaign can ever fill.
  const schema = JSON.parse(readFileSync(join(root, 'schema/v1/catalogue.schema.json'), 'utf8'));
  const { formats } = run([]);
  assert.deepEqual(formats.slice().sort(), schema.$defs.slot.enum.slice().sort());
});

// ------------------------------------------------------------------------------------
// What the host page pays
// ------------------------------------------------------------------------------------

test('the slot holds its height open before the request is answered', async () => {
  // The whole point is that this is true *before* the fetch settles. Asserting it after
  // would prove nothing about the jump it exists to prevent.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  assert.match(container.shadowRoot.children[0].textContent, /min-height: 140px/);
  await h.settled();
});

test('every format reserves its own height', async () => {
  const { formats, internals } = run([]);
  for (const format of formats) {
    const container = el({ 'data-japode-ads': '', 'data-ad-format': format });
    run([container], { fetch: withCampaigns(campaign()) });
    const reserved = internals.RESERVED[format];
    assert.ok(reserved > 0, `${format} reserves nothing`);
    assert.match(container.shadowRoot.children[0].textContent, new RegExp(`min-height: ${reserved}px`));
  }
});

test('the reservation survives as a floor once the banner is drawn', async () => {
  // Dropping it on render would let the box shrink to the content, which is the same
  // jump, later and upward.
  const container = el({ 'data-japode-ads': '', 'data-ad-format': 'footer' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  assert.match(styleOf(container), /min-height: 96px/);
});

test('a slot that will never draw gives its space back', async () => {
  // The one case where moving the page is right: holding a blank gap open makes the
  // host site pay for an ad it never got.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign({ enabled: false })) });
  await h.settled();
  assert.match(container.shadowRoot.children[0].textContent, /display: none/);
  assert.equal(h.exposed.slots[0].showing, null);
});

test('a page view stays inside its weight budget, worst campaign included', () => {
  // Budget the thing the host page actually pays for, not the file that is easiest to
  // measure: the loader, the catalogue, and one logo. Which logo matters — budgeting
  // the average would let the heaviest campaign hide behind seven light ones, and the
  // reader only ever gets one.
  const gz = p => gzipSync(readFileSync(join(root, p))).length;
  const loader = gz('site/v1/ads.js');
  const catalogue = gz('site/v1/catalogue.json');

  const live = JSON.parse(readFileSync(join(root, 'site/v1/catalogue.json'), 'utf8'));
  const heaviest = live.campaigns
    .map(c => ({ id: c.id, bytes: gz('site' + c.logo.src) }))
    .sort((a, b) => b.bytes - a.bytes)[0];

  const total = loader + catalogue + heaviest.bytes;
  const budget = 40 * 1024;
  assert.ok(
    total < budget,
    `worst page view is ${(total / 1024).toFixed(1)}KB ` +
    `(loader ${(loader / 1024).toFixed(1)} + catalogue ${(catalogue / 1024).toFixed(1)} + ` +
    `${heaviest.id} ${(heaviest.bytes / 1024).toFixed(1)}), budget is ${budget / 1024}KB`
  );
});

test('no single logo can dominate a page view', () => {
  // The failure this catches is one campaign quietly shipping artwork that costs more
  // than everything else on the page combined, which is how freewilly's traced SVG got
  // to 37KB without anyone noticing.
  const gz = p => gzipSync(readFileSync(join(root, p))).length;
  const live = JSON.parse(readFileSync(join(root, 'site/v1/catalogue.json'), 'utf8'));
  for (const c of live.campaigns) {
    for (const key of ['src', 'srcDark']) {
      if (!c.logo[key]) continue;
      const bytes = gz('site' + c.logo[key]);
      assert.ok(bytes < 28 * 1024, `${c.id}.logo.${key} is ${(bytes / 1024).toFixed(1)}KB gzipped`);
    }
  }
});

test('the banner asks for nothing but its own logo', async () => {
  // One catalogue request, one image. No fonts, no beacons, no third party: the network
  // is this domain and a host page can verify that from its own network panel.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  assert.equal(h.fetches.length, 1);
  const style = styleOf(container);
  assert.doesNotMatch(style, /url\(|@import/, 'the stylesheet fetches nothing');
  assert.equal(container.shadowRoot.find('logo').getAttribute('loading'), 'lazy');
});

test('the banner respects a reader who asked for less motion', async () => {
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  assert.match(styleOf(container), /@media \(prefers-reduced-motion: reduce\)[^}]*transition: none/);
});

test('the link is reachable and visibly focused by keyboard', async () => {
  // An <a href> is focusable on its own; what a shadow root can lose is the ring, and
  // a slot nobody can see themselves land on is a slot nobody tabs into twice.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  assert.ok(container.shadowRoot.find('unit').getAttribute('href'));
  assert.match(styleOf(container), /\.unit:focus-visible \{ outline: 2px solid/);
});

// ------------------------------------------------------------------------------------
// Declared theme
// ------------------------------------------------------------------------------------

test('a campaign that declares no theme still draws, in the neutral defaults', async () => {
  const bare = campaign();
  delete bare.theme;
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(bare) });
  await h.settled();
  assert.equal(h.exposed.slots[0].showing, 'roadkeep');
  // Neutral rather than a guess at the brand: an invented accent would be a claim the
  // advertiser never made.
  assert.match(styleOf(container), /#1f2937/);
});

test('the call to action is drawn three ways from the same accent', async () => {
  const expected = {
    solid: /\.cta \{[\s\S]*?background: #b45309/,
    outline: /\.cta \{[\s\S]*?background: none; color: #b45309/,
    text: /\.cta \{[\s\S]*?text-decoration: underline/,
  };
  for (const treatment of ['solid', 'outline', 'text']) {
    const c = campaign();
    c.theme.cta = treatment;
    const container = el({ 'data-japode-ads': '' });
    const h = run([container], { fetch: withCampaigns(c) });
    await h.settled();
    assert.match(styleOf(container), expected[treatment], `cta: ${treatment}`);
  }
});

test('a declared font stack reaches the banner and no webfont is fetched', async () => {
  const c = campaign();
  c.theme.font = 'serif';
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(c) });
  await h.settled();
  const style = styleOf(container);
  assert.match(style, /ui-serif, Georgia/);
  assert.doesNotMatch(style, /@import|@font-face|url\(/, 'the network serves no fonts');
  assert.equal(h.fetches.length, 1, 'still one request, the catalogue');
});

test('an unknown font or cta value falls back instead of reaching the stylesheet', async () => {
  // These come from the catalogue, and a family string written into CSS is a string
  // that can close the declaration it sits in. Naming the options is what prevents it.
  const c = campaign();
  c.theme.font = 'Comic Sans; } :host { display: none } .x {';
  c.theme.cta = 'exploded';
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(c) });
  await h.settled();
  const style = styleOf(container);
  assert.doesNotMatch(style, /Comic Sans/, 'the string never reaches the stylesheet');
  assert.doesNotMatch(style, /:host \{ display: none/, 'nor does the rule it tried to smuggle in');
  // The font declaration is one of the three stacks and nothing else — no stray brace
  // could have closed it, because the value was never taken from the catalogue.
  const declaration = /\n  font: 400 15px\/1\.5 ([^;]+);/.exec(style);
  assert.equal(declaration[1], 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
});

test('a second surface stop becomes a gradient', async () => {
  const c = campaign();
  c.theme.light.surfaceTo = '#e2e8f0';
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(c) });
  await h.settled();
  assert.match(styleOf(container), /linear-gradient\(135deg, #f8fafc 0%, #e2e8f0 100%\)/);
});

// ------------------------------------------------------------------------------------
// Formats
// ------------------------------------------------------------------------------------

/** The stylesheet the renderer inserted alongside the unit. */
function styleOf(container) {
  return container.shadowRoot.children[0].textContent;
}

test('each format reaches the markup as its own class', async () => {
  const { formats } = run([]);
  for (const format of formats) {
    const container = el({ 'data-japode-ads': '', 'data-ad-format': format });
    const h = run([container], { fetch: withCampaigns(campaign()) });
    await h.settled();
    assert.equal(container.shadowRoot.find('unit').className, 'unit ' + format);
  }
});

test('every format carries the same fields from the same entry', async () => {
  // §RK12's constraint: a format rearranges the entry, it never asks for a new field.
  // What each one chooses to show is CSS; what the renderer builds is identical.
  const { formats } = run([]);
  for (const format of formats) {
    const container = el({ 'data-japode-ads': '', 'data-ad-format': format });
    const h = run([container], { fetch: withCampaigns(campaign()) });
    await h.settled();
    const root = container.shadowRoot;
    for (const part of ['logo', 'product', 'headline', 'support', 'cta', 'mark']) {
      assert.ok(root.find(part), `${format} is missing .${part}`);
    }
  }
});

test('every format has a rule of its own in the stylesheet', async () => {
  // A format that names itself in the markup and nowhere in the CSS is a format that
  // silently renders as the default — the failure this test exists to catch.
  const { formats } = run([]);
  for (const format of formats) {
    if (format === 'in-content') continue; // the base shape, deliberately unstyled
    const container = el({ 'data-japode-ads': '', 'data-ad-format': format });
    const h = run([container], { fetch: withCampaigns(campaign()) });
    await h.settled();
    assert.match(styleOf(container), new RegExp('\\.unit\\.' + format + '\\b'), `${format} has no layout`);
  }
});

test('a format that restyles the call to action undoes all of it', async () => {
  // Overriding the fill alone leaves the pill's border and radius behind, which with no
  // padding draws an ellipse around the label. Any format that opts out of the button
  // has to opt out of its shape too.
  for (const treatment of ['solid', 'outline', 'text']) {
    const c = campaign();
    c.theme.cta = treatment;
    const container = el({ 'data-japode-ads': '', 'data-ad-format': 'strip' });
    const h = run([container], { fetch: withCampaigns(c) });
    await h.settled();
    const rule = /\.unit\.strip \.cta \{[^}]*\}/.exec(styleOf(container))[0];
    assert.match(rule, /border: 0/, `strip + cta:${treatment} keeps a border`);
    assert.match(rule, /border-radius: 0/, `strip + cta:${treatment} keeps the pill radius`);
  }
});

test('the strip drops the supporting line rather than shrink it away', async () => {
  // Compact means carrying less, not rendering the same thing at a size nobody reads.
  const container = el({ 'data-japode-ads': '', 'data-ad-format': 'strip' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  assert.match(styleOf(container), /\.unit\.strip \.support \{ display: none; \}/);
  assert.equal(container.shadowRoot.find('support').textContent, campaign().support,
    'still built, so a wider format sharing this entry is unaffected');
});

test('fluidity is measured against the slot, never the viewport', async () => {
  // A sidebar is narrow on a wide screen too, so @media would answer the wrong question.
  const container = el({ 'data-japode-ads': '' });
  const h = run([container], { fetch: withCampaigns(campaign()) });
  await h.settled();
  const style = styleOf(container);
  assert.match(style, /container-type: inline-size/);
  assert.match(style, /@container \(max-width/);
  // prefers-reduced-motion is the one media query that is genuinely about the reader.
  const mediaQueries = style.match(/@media[^{]*/g) ?? [];
  assert.deepEqual(
    mediaQueries.filter(q => !q.includes('prefers-reduced-motion')),
    [],
    'layout must not depend on viewport width'
  );
});
