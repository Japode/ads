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
const failures = [];
const notes = [];

const ok = (cond, what, detail) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${what}${detail ? `  ${detail}` : ''}`);
  if (!cond) failures.push(what);
};

async function main() {
  // 1. The catalogue itself.
  const cat = await fetch(`${origin}/v1/catalogue.json`);
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
  if (parsed) ok(parsed.version === 1, 'catalogue declares version 1', `got ${parsed.version}`);

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

  // 4. An asset, on a path that never changes, where a long lifetime is what we want.
  const logo = await fetch(`${origin}/logos/roadkeep.svg`);
  ok(logo.status === 200, 'a logo responds 200', `got ${logo.status}`);
  ok(
    logo.headers.get('access-control-allow-origin') === '*',
    'logos are readable cross-origin',
    logo.headers.get('access-control-allow-origin') ?? '(absent)'
  );

  // 5. A snippet lands on an https page, so a plain-http origin would be blocked as mixed
  // content. The redirect is what makes an http URL in someone's copy-paste harmless.
  const plain = await fetch(`${origin.replace('https://', 'http://')}/v1/catalogue.json`, {
    redirect: 'manual',
  });
  ok(
    plain.status === 301 && (plain.headers.get('location') ?? '').startsWith('https://'),
    'http redirects to https',
    `${plain.status} → ${plain.headers.get('location') ?? '(no location)'}`
  );

  // 6. A missing path must be a clean 404, so the loader can tell "no such campaign file"
  // from "the origin is broken" and collapse the slot rather than draw an error.
  const missing = await fetch(`${origin}/v1/does-not-exist.json`);
  ok(missing.status === 404, 'a missing path is a clean 404', `got ${missing.status}`);
}

main().then(
  () => {
    if (notes.length) console.log('\n' + notes.map(n => `note  ${n}`).join('\n'));
    if (failures.length) {
      console.error(`\n${origin} no longer behaves as the loader expects:\n` + failures.map(f => `  ${f}`).join('\n'));
      process.exit(1);
    }
    console.log(`\n${origin}: every assumption the loader is written against still holds.`);
  },
  err => {
    console.error(`could not reach ${origin}: ${err.message}`);
    process.exit(1);
  }
);
