// What ads.japode.com actually answers, checked against what the design assumes.
//
//   node tools/check-origin.mjs [origin]
//
// Pages fixes its own headers and we cannot configure them, so the design does not get to
// choose these facts — it can only depend on them and notice when they change. This is
// deliberately NOT part of `npm run validate`: it needs the network and a deployed site,
// and a flaky request must never block a deploy that changed nothing about the origin.
// Run it after a deploy, or on a schedule.
//
// Exit 0 = the origin still behaves the way the loader is written to expect.

const origin = (process.argv[2] ?? 'https://ads.japode.com').replace(/\/$/, '');

// The one path every pasted snippet points at. Everything else here is derived from it,
// including the version it is required to answer — writing the version twice would let
// the check agree with itself while the origin disagreed with both.
const CATALOGUE_PATH = '/v1/catalogue.json';
const LOADER_PATH = '/v1/ads.js';
const PATH_VERSION = Number(/\/v(\d+)\//.exec(CATALOGUE_PATH)[1]);

const failures = [];
const notes = [];

const ok = (cond, what, detail) => {
  const mark = cond ? 'ok  ' : 'FAIL';
  const suffix = detail ? `  ${detail}` : '';
  console.log(`${mark}  ${what}${suffix}`);
  if (!cond) failures.push(what);
};

async function main() {
  // 1. The catalogue itself.
  const cat = await fetch(origin + CATALOGUE_PATH);
  const body = await cat.text();
  ok(cat.status === 200, 'catalogue responds 200', `got ${cat.status}`);
  ok(
    (cat.headers.get('content-type') ?? '').includes('application/json'),
    'catalogue is served as JSON',
    cat.headers.get('content-type') ?? '(no content-type)'
  );

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    ok(false, 'catalogue parses as JSON');
  }
  // The version in the path and the version in the payload are one promise, not two. A
  // /v1/ URL that starts answering v2 breaks every snippet already pasted into a site we
  // do not control, and that is the one failure no push from here can repair.
  if (parsed)
    ok(
      parsed.version === PATH_VERSION,
      'the served version matches its version path',
      `/v${PATH_VERSION}/ answers version ${parsed.version}`
    );

  // 2. The one header the whole product depends on. A static file on another domain is
  // only readable from a host page because Pages sends this, and nothing we control
  // would restore it if Pages stopped.
  const cors = cat.headers.get('access-control-allow-origin');
  ok(cors === '*', 'catalogue is readable cross-origin', `access-control-allow-origin: ${cors ?? '(absent)'}`);

  // 3. Cache lifetime is Pages' to set. Recorded rather than asserted at a value: the
  // design's requirement is that a lifetime exists and is short enough to be worth
  // busting from the URL, not that it equals any particular number.
  const cc = cat.headers.get('cache-control') ?? '';
  const maxAge = /max-age=(\d+)/.exec(cc);
  ok(!!maxAge, 'catalogue declares a cache lifetime', cc || '(no cache-control)');
  if (maxAge) {
    const seconds = Number(maxAge[1]);
    notes.push(
      `the catalogue is cached for ${seconds}s (${Math.round(seconds / 60)} min), which is how stale a ` +
      `campaign edit can be for a reader who already loaded it — the loader busts this from the URL`
    );
    if (seconds > 3600)
      failures.push(`cache lifetime is ${seconds}s: longer than an hour makes a campaign edit unshippable`);
  }

  // 3b. When the catalogue last changed. The file used to carry a hand-typed "updated"
  // field, which was wrong by seventeen hours the day it shipped; it was removed on the
  // argument that HTTP answers this correctly and for free. That argument is only worth
  // anything while it keeps being true, which is what these assert.
  const lastModified = cat.headers.get('last-modified');
  const etag = cat.headers.get('etag');
  ok(!!lastModified, 'the origin says when the catalogue last changed', lastModified ?? '(no last-modified)');
  ok(!!etag, 'the catalogue has an entity tag', etag ?? '(no etag)');

  if (etag) {
    // The other half: a reader who already has it spends nothing to find out it is
    // unchanged. Without this, freshness would cost a full download every time.
    const conditional = await fetch(origin + CATALOGUE_PATH, { headers: { 'if-none-match': etag } });
    ok(conditional.status === 304, 'an unchanged catalogue is answered 304', `got ${conditional.status}`);
  }

  // 4. An asset, on a path that never changes, where a long lifetime is what we want.
  const logo = await fetch(`${origin}/logos/roadkeep.svg`);
  ok(logo.status === 200, 'a logo responds 200', `got ${logo.status}`);
  ok(
    logo.headers.get('access-control-allow-origin') === '*',
    'logos are readable cross-origin',
    logo.headers.get('access-control-allow-origin') ?? '(absent)'
  );

  // 5. The other half of the snippet. Every pasted <script src> points here, so this URL
  // is as permanent as the catalogue's. The content type matters on its own: a script
  // served as text/plain is refused outright by a browser that was sent nosniff.
  const loader = await fetch(origin + LOADER_PATH);
  ok(loader.status === 200, 'the loader responds 200', `got ${loader.status}`);
  ok(
    /javascript|ecmascript/i.test(loader.headers.get('content-type') ?? ''),
    'the loader is served as JavaScript',
    loader.headers.get('content-type') ?? '(no content-type)'
  );

  // 6. A snippet lands on an https page, so a plain-http origin would be blocked as mixed
  // content. The redirect is what makes an http URL in someone's copy-paste harmless.
  const plain = await fetch(origin.replace('https://', 'http://') + CATALOGUE_PATH, {
    redirect: 'manual',
  });
  ok(
    plain.status === 301 && (plain.headers.get('location') ?? '').startsWith('https://'),
    'http redirects to https',
    `${plain.status} → ${plain.headers.get('location') ?? '(no location)'}`
  );

  // 7. A missing path must be a clean 404, so the loader can tell "no such campaign file"
  // from "the origin is broken" and collapse the slot rather than draw an error.
  const missing = await fetch(`${origin}/v1/does-not-exist.json`);
  ok(missing.status === 404, 'a missing path is a clean 404', `got ${missing.status}`);
}

/**
 * Run the checks, and run them again before believing a bad answer.
 *
 * This runs unattended on a schedule now, which changes what a single failure means: a
 * person running it by hand simply runs it again, and a nightly job that cries wolf over
 * one dropped connection is a job everybody learns to ignore. The failure it exists to
 * catch — Pages quietly dropping the cross-origin header — will still be there in five
 * seconds; a flaky socket will not.
 */
async function attempt() {
  failures.length = 0;
  notes.length = 0;
  try {
    await main();
    return null;
  } catch (err) {
    return `could not reach ${origin}: ${err.message}`;
  }
}

let unreachable = await attempt();

if (unreachable || failures.length) {
  const first = unreachable ? [unreachable] : failures.slice();
  console.log(`\nretrying in 5s before reporting ${first.length} problem(s)…\n`);
  await new Promise(r => setTimeout(r, 5000));
  unreachable = await attempt();
}

if (unreachable) {
  console.error(unreachable);
  process.exit(1);
}

if (notes.length) console.log('\n' + notes.map(n => `note  ${n}`).join('\n'));

if (failures.length) {
  console.error(`\n${origin} no longer behaves as the loader expects, twice:\n` + failures.map(f => `  ${f}`).join('\n'));
  process.exit(1);
}

console.log(`\n${origin}: every assumption the loader is written against still holds.`);
