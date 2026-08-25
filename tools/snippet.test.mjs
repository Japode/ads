// The generator and the loader's parser, checked against each other.
//
// Both halves are read out of the files the domain serves: the generator from the inline
// script in site/index.html, the parser from site/v1/ads.js. What is asserted is never
// that the generator produced some particular string, but that the string it produced,
// parsed by the loader, is the configuration the site owner selected. Agreement between
// the two halves is the only thing worth checking.
//
// This is the more dangerous half of the contract. A loader bug leaves one slot empty; a
// generator bug is copied away by every site that used it, onto pages nothing here can
// reach.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'site/index.html'), 'utf8');
const loader = readFileSync(join(root, 'site/v1/ads.js'), 'utf8');

/** The page's own inline script, as shipped. */
const generatorSource = (() => {
  const blocks = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const found = blocks.find(b => b.includes('__japodeSnippetInternals'));
  assert.ok(found, 'the generator no longer exposes itself for testing');
  // The page writes <\/script> escaped so the tag does not end early inside the string.
  return found.replaceAll('<\\/script>', '</script>');
})();

/** A text input or checkbox the generator will read. */
const field = () => ({
  value: '',
  checked: false,
  disabled: false,
  addEventListener() {},
});

/** Run the generator with these field values, and return the snippet it emits. */
function generate(values = {}) {
  const ids = ['g-format', 'g-slot', 'g-theme', 'g-lang', 'g-lang-any', 'g-tags', 'g-exclude', 'g-memory'];
  const nodes = {};
  for (const id of ids) nodes[id] = field();
  for (const [id, v] of Object.entries(values)) {
    assert.ok(nodes[id], `no such field ${id}`);
    if (typeof v === 'boolean') nodes[id].checked = v;
    else nodes[id].value = v;
  }

  const out = { innerHTML: '', textContent: '' };
  const context = {
    document: {
      getElementById: id => nodes[id] ?? null,
      // The generator reads '#generated code' for its output and '.copy' for the copy
      // buttons; everything else on the page is not its business.
      querySelector: () => out,
      querySelectorAll: () => [],
    },
    navigator: {},
    setTimeout,
    window: {},
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(generatorSource, context, { filename: 'index.html' });
  return context.__japodeSnippetInternals.build();
}

/**
 * Parse a generated snippet the way a browser would, then hand the resulting attributes
 * to the loader's own reader.
 *
 * The attribute regex is deliberately strict: it accepts double-quoted values and
 * nothing else, so a snippet the generator emitted unquoted or half-quoted fails here
 * rather than being quietly tolerated.
 */
function readBack(snippet) {
  const div = /<div ([\s\S]*?)><\/div>/.exec(snippet);
  assert.ok(div, `the snippet has no slot element:\n${snippet}`);

  const attrs = { 'data-japode-ads': '' };
  let rest = div[1].replace('data-japode-ads', '').trim();
  while (rest) {
    const m = /^([a-z-]+)="([^"]*)"\s*/.exec(rest);
    assert.ok(m, `unparseable attribute in:\n${div[1]}`);
    // Entity decoding, which is what a browser does before the loader ever sees a value.
    attrs[m[1]] = m[2].replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    rest = rest.slice(m[0].length);
  }

  const context = {
    document: {
      readyState: 'loading',
      currentScript: { src: 'https://ads.japode.com/v1/ads.js' },
      documentElement: { getAttribute: () => 'en' },
      querySelectorAll: () => [],
      addEventListener() {},
    },
    console: { warn() {} },
    URL,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(loader, context, { filename: 'ads.js' });

  const el = { getAttribute: n => (Object.hasOwn(attrs, n) ? attrs[n] : null) };
  // readSlot(el, doc, index): the document is how it reaches <html lang> for a slot that
  // omitted data-ad-lang, which is the whole point of the omitted-versus-empty case.
  const slot = context.__japodeAdsInternals.readSlot(el, context.document, 0);
  return { slot, attrs };
}

const roundTrip = values => readBack(generate(values)).slot;

test('the bare snippet round-trips to the documented defaults', () => {
  const slot = roundTrip();
  assert.equal(slot.format, 'in-content');
  assert.equal(slot.theme, 'auto');
  assert.deepEqual([...slot.tags], []);
  assert.deepEqual([...slot.exclude], []);
  assert.deepEqual([...slot.warnings], []);
});

test('the snippet names only what the owner chose', () => {
  // A snippet padded with every default is one whose reader cannot tell what matters.
  assert.equal(generate().match(/data-ad-/g), null);
  assert.equal(generate({ 'g-format': 'footer' }).match(/data-ad-/g).length, 1);
});

test('every field round-trips to the value that was selected', () => {
  const slot = roundTrip({
    'g-format': 'sidebar',
    'g-slot': 'rail-top',
    'g-theme': 'dark',
    'g-lang': 'pt-BR',
    'g-tags': 'devtools, cms',
    'g-exclude': 'roadkeep, shio',
  });
  assert.equal(slot.format, 'sidebar');
  assert.equal(slot.slot, 'rail-top');
  assert.equal(slot.theme, 'dark');
  assert.equal(slot.lang, 'pt-BR');
  assert.deepEqual([...slot.tags], ['devtools', 'cms']);
  assert.deepEqual([...slot.exclude], ['roadkeep', 'shio']);
  assert.deepEqual([...slot.warnings], [], 'a snippet this page generated must never warn');
});

test('a tag list typed with stray commas round-trips clean', () => {
  // ", devtools,, cms ," is what a real person types.
  const slot = roundTrip({ 'g-tags': ' , devtools,, cms , ' });
  assert.deepEqual([...slot.tags], ['devtools', 'cms']);
});

test('a list that is only commas emits no attribute at all', () => {
  const snippet = generate({ 'g-tags': ' , , ' });
  assert.doesNotMatch(snippet, /data-ad-tags/, 'an empty filter is not a filter');
  assert.deepEqual([...readBack(snippet).slot.tags], []);
});

test('a quote typed into a field cannot break out of its attribute', () => {
  // Without escaping this ends the attribute early and the rest becomes markup in
  // somebody else's page. The copy button copies textContent, so the raw build() output
  // is exactly what gets pasted.
  const snippet = generate({ 'g-slot': 'rail" onload="alert(1)' });
  const { slot, attrs } = readBack(snippet);
  assert.equal(slot.slot, 'rail" onload="alert(1)', 'the value survives as itself');
  assert.deepEqual(Object.keys(attrs).sort(), ['data-ad-slot', 'data-japode-ads'],
    'no extra attribute was smuggled in');
});

test('an ampersand survives as one character, not as an entity', () => {
  const slot = roundTrip({ 'g-slot': 'news&views' });
  assert.equal(slot.slot, 'news&views');
});

test('omitted and empty lang are both emitable, and mean different things', () => {
  // The loader reads an absent data-ad-lang as "inherit the page" and an empty one as
  // "any language". A generator that could only produce one of those would leave the
  // other unreachable to every site owner using this page.
  const inherited = generate();
  assert.doesNotMatch(inherited, /data-ad-lang/);
  assert.equal(readBack(inherited).slot.lang, 'en', 'inherits the page language');

  const any = generate({ 'g-lang-any': true });
  assert.match(any, /data-ad-lang=""/);
  assert.equal(readBack(any).slot.lang, '', 'accepts every language');
});

test('any-language wins over whatever is left in the text field', () => {
  // The checkbox disables the input, so a stale value must not leak into the snippet.
  const snippet = generate({ 'g-lang': 'pt-BR', 'g-lang-any': true });
  assert.match(snippet, /data-ad-lang=""/);
  assert.doesNotMatch(snippet, /pt-BR/);
});

test('the snippet points at the version path the loader is served from', () => {
  const snippet = generate();
  assert.match(snippet, /<script src="https:\/\/ads\.japode\.com\/v1\/ads\.js" async>/);
});

test('every option the page offers round-trips without warning', () => {
  // The selects are the one place the page can offer a value the loader would reject.
  const options = key => [...page.matchAll(new RegExp(`<select id="g-${key}"[\\s\\S]*?</select>`, 'g'))]
    .flatMap(m => [...m[0].matchAll(/value="([^"]*)"/g)].map(o => o[1]));

  for (const format of options('format')) {
    const slot = roundTrip(format ? { 'g-format': format } : {});
    assert.deepEqual([...slot.warnings], [], `format "${format}" warns`);
  }
  for (const theme of options('theme')) {
    const slot = roundTrip(theme ? { 'g-theme': theme } : {});
    assert.deepEqual([...slot.warnings], [], `theme "${theme}" warns`);
  }
  for (const memory of options('memory')) {
    const slot = roundTrip(memory ? { 'g-memory': memory } : {});
    assert.deepEqual([...slot.warnings], [], `memory "${memory}" warns`);
  }
});

test('declining the memory round-trips as a decline', () => {
  // The one attribute whose value the site owner may be held to by somebody else, so a
  // generator that emitted it wrong would be worse than one that omitted it.
  const off = generate({ 'g-memory': 'off' });
  assert.match(off, /data-ad-memory="off"/);
  assert.equal(readBack(off).slot.memory, 'off');

  // Default stays absent: the snippet says only what the owner chose.
  assert.doesNotMatch(generate(), /data-ad-memory/);
  assert.equal(roundTrip().memory, 'on');
});
