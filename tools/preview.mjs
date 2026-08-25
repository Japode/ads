// The catalogue, drawn every way it can be, without publishing it first.
//
//   npm run preview          → http://localhost:8080/preview
//
// Serves site/ exactly as Pages does, so the loader running here is the same file at the
// same paths, fetching the same catalogue from its own origin — that last part is free
// because the loader reads its origin from its own script tag rather than hardcoding it.
//
// Editing site/v1/catalogue.json and reloading shows the change. Nothing is built, and
// nothing about the preview reaches the published site: the gallery is generated per
// request and lives at a path site/ does not contain.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const FORMATS = ['sidebar', 'in-content', 'footer', 'strip'];

const escape = s =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * The gallery.
 *
 * Every cell is a real slot driven by the published loader. Pinning one campaign to one
 * slot uses only the contract a host site has: data-ad-exclude naming everyone else.
 * Inventing a preview-only attribute would mean the thing being reviewed is not the
 * thing that ships.
 */
export function gallery() {
  const catalogue = JSON.parse(readFileSync(join(site, 'v1/catalogue.json'), 'utf8'));
  const ids = catalogue.campaigns.map(c => c.id);

  const rows = catalogue.campaigns
    .map(campaign => {
      const others = ids.filter(id => id !== campaign.id).join(',');
      const withdrawn = campaign.enabled === false;
      const cells = FORMATS.map(
        format => `
        <figure class="cell ${format}">
          <figcaption>${escape(format)}</figcaption>
          <div data-japode-ads
               data-ad-format="${escape(format)}"
               data-ad-slot="${escape(campaign.id)}-${escape(format)}"
               data-ad-lang=""
               data-ad-exclude="${escape(others)}"></div>
        </figure>`
      ).join('');

      // A withdrawn entry is shown as withdrawn: rotation excludes it, so its cells stay
      // empty. A preview that drew it anyway would be showing something production never
      // would, which is the one thing a preview must not do.
      const note = withdrawn
        ? ' <span class="tag">withdrawn — out of rotation, so these stay empty</span>'
        : '';

      return `
      <section>
        <h2>${escape(campaign.product)} <code>${escape(campaign.id)}</code>${note}</h2>
        <div class="grid">${cells}</div>
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en" data-preview>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Catalogue preview</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#0f172a; --muted:#64748b; --line:#e2e8f0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1120; --fg:#e2e8f0; --muted:#94a3b8; --line:#24304a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 ui-sans-serif, system-ui, sans-serif; }
  .wrap { max-width: 78rem; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
  h1 { margin:0 0 .35rem; font-size:1.6rem; letter-spacing:-.02em; }
  .lede { color:var(--muted); margin:0 0 2rem; }
  section { border-top:1px solid var(--line); padding-top:1.5rem; margin-top:2rem; }
  h2 { font-size:1.05rem; margin:0 0 1rem; font-weight:650; }
  h2 code { font-weight:400; font-size:.85em; color:var(--muted); }
  .tag { font-size:.7rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); border:1px solid var(--line); border-radius:99px; padding:.1rem .5rem; }
  /* Deliberately different widths: a format that only holds up at one width is a format
     that has not been reviewed. */
  .grid { display:grid; gap:1.5rem; grid-template-columns:minmax(0,1fr); }
  .grid > * { min-width:0; }
  @media (min-width: 60rem) { .grid { grid-template-columns: 16rem minmax(0,1fr); } .footer, .strip { grid-column:1 / -1; } }
  figure { margin:0; }
  figcaption { font-size:.72rem; color:var(--muted); margin-bottom:.4rem; font-family:ui-monospace,monospace; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Catalogue preview</h1>
  <p class="lede">
    ${catalogue.campaigns.length} campaigns × ${FORMATS.length} formats, drawn by the
    published loader against <code>site/v1/catalogue.json</code> on disk. Edit it and
    reload. Switch your OS theme to see the dark half.
  </p>
  ${rows}
</div>
<script src="/v1/ads.js" async></script>
</body>
</html>
`;
}

/** The gallery is importable so its pinning trick can be tested without a browser. */
export const PREVIEW_FORMATS = FORMATS;

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);

  if (path === '/preview' || path === '/preview/') {
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
    res.end(gallery());
    return;
  }

  const file = resolve(join(site, path === '/' ? '/index.html' : path));
  if (!file.startsWith(site) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    // The headers Pages sends, so the loader is exercised against what it will meet.
    'access-control-allow-origin': '*',
    'cache-control': path.startsWith('/v1/') ? 'max-age=600' : 'max-age=60',
  });
  res.end(readFileSync(file));
});

// Importing this file must not open a port: the tests read the gallery, they do not
// want a listener left behind.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, () => {
    console.log(`site/    http://localhost:${port}/`);
    console.log(`preview  http://localhost:${port}/preview`);
  });
}
