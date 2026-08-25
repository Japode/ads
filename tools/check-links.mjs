// Does every campaign still lead somewhere?
//
//   npm run check-links
//
// Not part of the publish gate, on purpose. The gate reads the catalogue and the files
// beside it and never leaves the machine, which is what lets it run on every push; a
// network check in that path would let a flaky DNS lookup block a deploy that changed
// nothing about the links. This runs on a schedule instead, and a failing run is the
// report — there is nowhere else to send one, and nothing here to maintain.
//
// Exit 0 = every destination answered. Exit 1 = one did not, twice.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cataloguePath = resolve(root, process.argv[2] ?? 'site/v1/catalogue.json');

/**
 * A browser's user agent, because some clients are answered differently.
 *
 * cursarei.com.br was seen answering 403 to one automated fetcher while serving 200 to a
 * browser — and 200 to a bare Node fetch, so the line is not "browser versus script" but
 * whatever a given edge decides about a given client. Which is the argument: a checker
 * cannot know where that line is drawn, so it should look like the thing the reader will
 * be, and treat an ambiguous refusal as ambiguous rather than as death. A false alarm
 * teaches everyone to ignore the real one.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const TIMEOUT_MS = 20_000;

/** A status that says something about the site rather than about the checker. */
const INCONCLUSIVE = new Set([401, 403, 405, 429]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** One request. Never throws: a failure is a result, not an exception. */
async function probe(url) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      signal: control.signal,
    });
    return { status: res.status, finalUrl: res.url };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? `no answer in ${TIMEOUT_MS / 1000}s` : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check one destination, twice if the first attempt looks bad.
 *
 * §RK23 asks that a failure repeat before it is reported. A second attempt after a pause
 * is that: most of what a single request calls dead is a timeout, a rate limit or a
 * deploy in progress, and reporting those trains the reader to ignore the report.
 */
async function check(campaign) {
  const url = campaign.cta.href;
  let result = await probe(url);

  if (result.status !== 200) {
    await sleep(3000);
    const second = await probe(url);
    // The kinder of the two answers wins: one good response proves it is reachable.
    if (second.status === 200 || result.status === 0) result = second;
  }

  const notes = [];
  if (result.finalUrl && result.finalUrl !== url) {
    // Not a failure, but a catalogue edit worth making: every reader is paying a hop.
    notes.push(`redirects to ${result.finalUrl}`);
  }

  if (result.status === 200) return { id: campaign.id, url, ok: true, notes };
  if (INCONCLUSIVE.has(result.status)) {
    return { id: campaign.id, url, ok: true, notes: [...notes, `answered ${result.status}, which says nothing about the page`] };
  }
  return {
    id: campaign.id,
    url,
    ok: false,
    why: result.status === 0 ? result.error : `answered ${result.status}, twice`,
  };
}

const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'));

// Withdrawn entries are checked too: they stay in the file to come back, and a
// destination that rotted while an entry was out is one nobody would look at again.
const results = [];
for (const campaign of catalogue.campaigns) {
  results.push(await check(campaign));
}

for (const r of results) {
  const mark = r.ok ? 'ok  ' : 'DEAD';
  console.log(`${mark}  ${r.id.padEnd(12)} ${r.url}`);
  for (const note of r.notes ?? []) console.log(`      ${note}`);
  if (!r.ok) console.log(`      ${r.why}`);
}

const dead = results.filter(r => !r.ok);
if (dead.length) {
  console.error(`\n${dead.length} destination(s) no longer answer:`);
  for (const r of dead) console.error(`  ${r.id}: ${r.url} — ${r.why}`);
  process.exit(1);
}

const redirecting = results.filter(r => (r.notes ?? []).some(n => n.startsWith('redirects')));
console.log(
  `\n${results.length} destination(s) answered` +
  (redirecting.length ? `, ${redirecting.length} through a redirect worth editing out` : '') + '.'
);
