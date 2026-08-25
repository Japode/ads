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

test('the empty fallback response is valid against the v1 schema', async () => {
  // The loader's fallback has to be expressible in the contract it is a fallback for,
  // or the loader is coding against a shape nothing validates.
  const Ajv2020 = (await import('ajv/dist/2020.js')).default;
  const addFormats = (await import('ajv-formats')).default;
  const schema = JSON.parse(readFileSync(join(root, 'schema/v1/catalogue.schema.json'), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const valid = ajv.compile(schema)({ version: 1, campaigns: [] });
  assert.equal(valid, true, 'an empty campaigns array must be a legal v1 response');
});

test('publishing the empty fallback is refused', () => {
  const { code, out } = gate('empty-array', broken(c => { c.campaigns = []; }));
  assert.equal(code, 1, 'legal to answer with, not legal to publish');
  assert.match(out, /defined fallback response, not something to publish/);
});

test('an unreadable colour pair is refused', () => {
  // The loader cannot fix this: it runs on someone else's page, where the only remedy
  // for an unreadable banner is not drawing one. So the gate is where it has to fail.
  const { code, out } = gate('contrast', broken(c => {
    c.campaigns[0].theme.light.text = '#cccccc';
  }));
  assert.equal(code, 1);
  assert.match(out, /theme\.light: text on .* needs 4\.5/);
});

test('a gradient is checked at both ends', () => {
  // A pair that passes at one stop and fails at the other is exactly what a single
  // check waves through.
  const { code, out } = gate('gradient', broken(c => {
    c.campaigns[0].theme.light.surfaceTo = '#334155'; // dark end under dark text
  }));
  assert.equal(code, 1);
  assert.match(out, /on #334155/);
});

test('a campaign may decline a theme, and is told what that costs', () => {
  const { code, out } = gate('no-theme', broken(c => { delete c.campaigns[0].theme; }));
  assert.equal(code, 0, 'declaring no theme is legal');
  assert.match(out, /warn.*declares no theme.*carries none of its own brand/);
});

test('the shipped catalogue meets AA on every declared pair', () => {
  // Not a hypothetical: writing these tokens by eye put five failures in the catalogue,
  // across three campaigns, and this is what found them.
  const { code } = gate('live', JSON.stringify(good));
  assert.equal(code, 0);
});

test('every error is reported at once, not one per run', () => {
  const { out } = gate('many', broken(c => {
    c.campaigns[0].tagline = 'x';
    c.campaigns[1].weight = 500;
    c.campaigns[2].logo.src = '/logos/does-not-exist.svg';
  }));
  assert.match(out, /3 error\(s\)/);
});
