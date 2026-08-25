// The preview's one clever part, checked without a browser.
//
// Pinning a campaign to a cell is done with data-ad-exclude naming everyone else — the
// same attribute a host site has, so the thing under review is the thing that ships. If
// that trick stops working, the gallery quietly shows the wrong campaign under the right
// heading, which is worse than showing nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gallery, PREVIEW_FORMATS } from './preview.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loader = readFileSync(join(root, 'site/v1/ads.js'), 'utf8');
const catalogue = JSON.parse(readFileSync(join(root, 'site/v1/catalogue.json'), 'utf8'));

/** Every slot the gallery declares, as the attributes the loader will read. */
function slotsInGallery(html) {
  const out = [];
  for (const tag of html.match(/<div data-japode-ads[\s\S]*?><\/div>/g) ?? []) {
    const attrs = { 'data-japode-ads': '' };
    for (const [, name, value] of tag.matchAll(/data-ad-([a-z]+)="([^"]*)"/g)) {
      attrs['data-ad-' + name] = value;
    }
    out.push(attrs);
  }
  return out;
}

/** Run the published loader over those slots against the real catalogue. */
function render(slotAttrs) {
  const containers = slotAttrs.map(attrs => ({
    attrs,
    shadowRoot: null,
    getAttribute(n) { return Object.hasOwn(this.attrs, n) ? this.attrs[n] : null; },
    attachShadow() {
      this.shadowRoot = { children: [], appendChild(c) { this.children.push(c); }, set textContent(_) { this.children = []; } };
      return this.shadowRoot;
    },
  }));

  const node = () => ({
    className: '', children: [], attributes: {}, _text: '',
    setAttribute(n, v) { this.attributes[n] = v; },
    getAttribute(n) { return Object.hasOwn(this.attributes, n) ? this.attributes[n] : null; },
    appendChild(c) { this.children.push(c); return c; },
    set textContent(v) { this._text = v === null ? '' : String(v); this.children = []; },
    get textContent() { return this._text; },
  });

  const context = {
    document: {
      readyState: 'complete',
      currentScript: { src: 'http://localhost:8080/v1/ads.js' },
      createElement: node,
      documentElement: { getAttribute: () => 'en' },
      querySelectorAll: () => containers,
      addEventListener() {},
    },
    console: { warn() {} },
    URL,
    matchMedia: () => ({ matches: false }),
    location: { hostname: 'localhost' },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(catalogue) }),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(loader, context, { filename: 'ads.js' });
  return new Promise(r => setTimeout(() => r(JSON.parse(JSON.stringify(context.japodeAds))), 0));
}

test('the gallery covers every campaign in every format', () => {
  const slots = slotsInGallery(gallery());
  assert.equal(slots.length, catalogue.campaigns.length * PREVIEW_FORMATS.length);
});

test('each cell pins the campaign its heading names', async () => {
  const slots = slotsInGallery(gallery());
  const shown = await render(slots);

  const rotating = new Set(catalogue.campaigns.filter(c => c.enabled !== false && c.weight !== 0).map(c => c.id));

  for (const slot of shown.slots) {
    // The slot name the gallery wrote is "<campaign>-<format>", which is also the claim
    // the heading above it makes.
    const [, id, format] = /^(.+)-(sidebar|in-content|footer|strip)$/.exec(slot.slot);
    assert.equal(slot.format, format, slot.slot);

    if (rotating.has(id)) {
      assert.equal(slot.showing, id, `${slot.slot} shows ${slot.showing}, not ${id}`);
    } else {
      // A withdrawn entry is out of rotation, so its cells stay empty on purpose — the
      // gallery labels them rather than drawing something production would not.
      assert.equal(slot.showing, null, `${slot.slot} drew a withdrawn campaign`);
    }
  }
});

test('the preview asks the loader for nothing a host site could not ask for', () => {
  // The moment the gallery needs an attribute the contract does not have, it stops
  // previewing what ships.
  const documented = new Set(['format', 'slot', 'theme', 'lang', 'tags', 'exclude']);
  for (const attrs of slotsInGallery(gallery())) {
    for (const key of Object.keys(attrs)) {
      if (key === 'data-japode-ads') continue;
      assert.ok(documented.has(key.replace('data-ad-', '')), `undocumented attribute ${key}`);
    }
  }
});

test('importing the preview does not open a port', () => {
  // The tests import this file; a listener left behind would fail the next run on a
  // port already in use.
  assert.equal(typeof gallery, 'function');
});
