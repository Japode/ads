// Did the domain actually start serving what the deploy uploaded?
//
//   node tools/check-deploy.mjs [origin]
//
// Every file in site/ is fetched from the origin and compared byte for byte against the
// copy in the repository. That is a narrower question than the daily origin check asks,
// and it is the one nothing was answering: a deleted CNAME, an artifact assembled from
// the wrong directory, a logo that arrived truncated all survive a green deploy and would
// otherwise wait for tomorrow's job to notice, or for a reader to.
//
// Runs after the deployment step and never before it. A network check that can block a
// publish is one that will eventually block a good one; running after the deploy has
// already succeeded marks the run without holding the domain hostage to a socket.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const origin = (process.argv[2] ?? 'https://ads.japode.com').replace(/\/$/, '');

/** A fresh token per run: Pages caches for ten minutes and ignores unknown parameters. */
const bust = `nocache=${process.env.GITHUB_RUN_ID ?? Math.floor(performance.now())}`;

/** How long to keep trying. A deploy reports success slightly before the edge agrees. */
const ATTEMPTS = 6;
const WAIT_MS = 15000;

const digest = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);

/** Every file under site/, as the path the origin should serve it at. */
function published(dir = site) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...published(full));
    else out.push('/' + relative(site, full).replaceAll('\\', '/'));
  }
  return out;
}

const expected = new Map(published().map(p => [p, readFileSync(join(site, p))]));

/** Fetch one path and say how it differs from the repository, or null if it does not. */
async function compare(path, want) {
  const url = `${origin}${path}?${bust}`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    return `${path}: could not be fetched (${e.message})`;
  }
  if (res.status !== 200) return `${path}: ${res.status}, but it is in site/`;

  const got = Buffer.from(await res.arrayBuffer());
  if (got.equals(want)) return null;

  // Line endings before anything else. Git normalises text to LF on commit, so a working
  // tree holding CRLF differs from the deploy on every text file while the deploy is
  // perfectly correct — locally that is the commonest mismatch and it is not a fault.
  const unify = b => Buffer.from(b.toString('binary').replaceAll('\r\n', '\n'), 'binary');
  if (unify(got).equals(unify(want))) {
    return `${path}: differs only in line endings — the working copy has CRLF and the ` +
      `deploy has LF, which is git normalising on commit rather than a bad deploy`;
  }

  // Truncation is a prefix, not a smaller number. Saying "truncated" for anything shorter
  // would call the previous version damaged, which is the wrong thing to tell somebody
  // reading this while a deploy is in flight.
  if (got.length < want.length && want.subarray(0, got.length).equals(got)) {
    return `${path}: truncated at ${got.length} of ${want.length} bytes`;
  }
  if (got.length !== want.length) {
    return `${path}: served ${got.length} bytes, site/ has ${want.length} — a different version`;
  }
  return `${path}: ${got.length} bytes but sha ${digest(got)}, site/ has ${digest(want)}`;
}

let problems = [];
let attempt = 0;

// The retry exists for propagation, not for flakiness: the edge can answer the previous
// version for a few seconds after deploy-pages reports success. Anything still wrong
// after a minute and a half is wrong.
while (attempt < ATTEMPTS) {
  attempt++;
  const results = await Promise.all([...expected].map(([p, want]) => compare(p, want)));
  problems = results.filter(Boolean);
  if (!problems.length) break;
  if (attempt < ATTEMPTS) {
    console.log(`attempt ${attempt}: ${problems.length} of ${expected.size} not there yet, waiting ${WAIT_MS / 1000}s`);
    await new Promise(r => setTimeout(r, WAIT_MS));
  }
}

if (problems.length) {
  console.error(`\n${origin} is not serving what site/ contains:\n` + problems.map(p => `  ${p}`).join('\n'));
  console.error(`\n${problems.length} of ${expected.size} file(s) wrong after ${attempt} attempt(s).`);
  process.exit(1);
}

console.log(`${origin}: all ${expected.size} published file(s) match site/ byte for byte` +
  (attempt > 1 ? ` (settled on attempt ${attempt})` : ''));
