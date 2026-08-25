// Proof that the gate refuses. A validator is only worth the deploy workflow's time if
// each way a catalogue can be broken actually stops it, so every case here mutates the
// real catalogue one way and asserts the exit code and the reason.
//
//   node --test tools/
//
// The fixtures are written to a temp directory and point at the real site/logos, so a
// case about a missing asset is about the asset and not about the fixture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validator = join(root, 'tools', 'validate-catalogue.mjs');
const good = JSON.parse(readFileSync(join(root, 'site/v1/catalogue.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'ads-catalogue-'));

/** Run the gate over `text` and return { code, out }. */
function gate(name, text) {
  const file = join(tmp, `${name}.json`);
  writeFileSync(file, text);
  const r = spawnSync(process.execPath, [validator, file], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Deep-copy the good catalogue and hand it to `mutate`. */
function broken(mutate) {
  const c = structuredClone(good);
  mutate(c);
  return JSON.stringify(c, null, 2);
}

test('the real catalogue passes', () => {
  const { code } = gate('good', JSON.stringify(good));
  assert.equal(code, 0, 'the committed catalogue must be publishable');
});

test('malformed JSON is refused with a line number', () => {
  const { code, out } = gate('syntax', JSON.stringify(good, null, 2).replace('{', '{\n  ,'));
  assert.equal(code, 1);
  assert.match(out, /not valid JSON \(line \d+, column \d+\)/);
});

test('an unknown field is refused', () => {
  const { code, out } = gate('unknown', broken(c => { c.campaigns[0].tagline = 'sneaked in'; }));
  assert.equal(code, 1);
  assert.match(out, /must NOT have additional properties "tagline"/);
});

test('a missing destination URL is refused', () => {
  const { code, out } = gate('no-href', broken(c => { delete c.campaigns[0].cta.href; }));
  assert.equal(code, 1);
  assert.match(out, /cta.*required property 'href'/s);
});

test('a plain-http destination is refused', () => {
  const { code, out } = gate('http', broken(c => { c.campaigns[0].cta.href = 'http://example.com/'; }));
  assert.equal(code, 1);
  assert.match(out, /cta\/href/);
});

test('an asset that does not resolve is refused', () => {
  const { code, out } = gate('ghost', broken(c => { c.campaigns[0].logo.src = '/logos/does-not-exist.svg'; }));
  assert.equal(code, 1);
  assert.match(out, /does not resolve/);
});

test('a declared size that does not match the file is refused', () => {
  const { code, out } = gate('wrong-size', broken(c => { c.campaigns[0].logo.width = 999; }));
  assert.equal(code, 1);
  assert.match(out, /the page would shift/);
});

test('a weight out of range is refused', () => {
  const { code, out } = gate('weight', broken(c => { c.campaigns[0].weight = 500; }));
  assert.equal(code, 1);
  assert.match(out, /weight/);
});

test('a duplicate id is refused', () => {
  const { code, out } = gate('dupe', broken(c => { c.campaigns[1].id = c.campaigns[0].id; }));
  assert.equal(code, 1);
  assert.match(out, /duplicate id/);
});

test('a catalogue nothing can render is refused', () => {
  const { code, out } = gate('empty', broken(c => { for (const x of c.campaigns) x.enabled = false; }));
  assert.equal(code, 1);
  assert.match(out, /every slot on every host site would collapse empty/);
});

test('an unreachable dark asset warns without refusing', () => {
  const { code, out } = gate('dark', broken(c => {
    const rk = c.campaigns.find(x => x.logo.srcDark);
    delete rk.theme.dark;
  }));
  assert.equal(code, 0, 'a warning must not stop a publishable catalogue');
  assert.match(out, /warn.*dark asset is unreachable/);
});

test('every error is reported at once, not one per run', () => {
  const { out } = gate('many', broken(c => {
    c.campaigns[0].tagline = 'x';
    c.campaigns[1].weight = 500;
    c.campaigns[2].logo.src = '/logos/does-not-exist.svg';
  }));
  assert.match(out, /3 error\(s\)/);
});
