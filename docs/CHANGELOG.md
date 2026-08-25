# Shipped Ledger

## Block A — Ad catalogue in JSON

- ✅ **RK1** **No JSON schema describes an ad campaign** — schema/v1/catalogue.schema.json: cada campanha traz id, produto, logo com variante escura e tamanho intrinseco, headline, apoio, CTA, tema, peso, slots, tags, idioma e exclusao por host.
- ✅ **RK3** **Product logos have no hosted, stable URL** — site/logos/ at fixed paths: SVG for cursarei, mini-gpt, roadkeep and freewilly, 256px PNG for shio, turing, viglet and claude-tray, plus an explicit roadkeep-dark.svg.
- ✅ **RK2** **The eight launch products have no entry in the catalogue** — site/v1/catalogue.json holds all eight entries with copy, brand theme, weight, tags, language and self-exclusion; destinations taken from each product's own git remote or CNAME.
- ✅ **RK4** **Nothing rejects a malformed catalogue before it is published** — npm run validate refuses the file: ajv against the v1 schema plus the rules it cannot state, and 12 tests prove each way a catalogue breaks actually stops the publish.
- ✅ **RK22** **The cursarei campaign points at a repository that returns 404** — cursarei is enabled:false in the catalogue, keeping its id, and the gate now reports campaigns in rotation and withdrawn instead of a bare total.

## Block B — Static API on ads.japode.com

- ✅ **RK5** **ads.japode.com serves nothing** — Pages on Japode/ads serves ads.japode.com over enforced HTTPS with source Actions, and site/CNAME claims the domain in the artifact; the DNS CNAME to japode.github.io was already in place.
- ✅ **RK21** **Nothing builds and publishes the site to Pages** — .github/workflows/deploy.yml tests the gate, validates the catalogue and uploads site/ to Pages on every push to main; a docs-only commit is skipped since docs are never served.
- ✅ **RK6** **GitHub Pages serves headers we cannot configure** — npm run check-origin measures what Pages answers: CORS is * on the catalogue and the logos, http 301s to https, a missing path is a clean 404, and the cache lifetime is 600s.
- ✅ **RK7** **The endpoint has no version path and no fallback payload** — The v1 schema now admits campaigns: [] as the defined fallback, the gate refuses publishing it, and check-origin asserts the path version and the payload version are one promise.

## Block C — Embed snippet and JavaScript loader

- ✅ **RK8** **There is no HTML snippet a site owner can paste** — site/v1/ads.js discovers [data-japode-ads] containers and reads data-ad-format, slot, theme, lang, tags and exclude; an unknown attribute is ignored so a pasted snippet never breaks.
- ✅ **RK9** **The loader would block rendering and inherit host page CSS** — One catalogue request per page, bucketed to the 600s Pages serves and fetched from the loader's own origin; each slot gets an open shadow root, and any failure resolves to the empty response.
- ✅ **RK10** **No page documents the snippet or generates one** — site/index.html is the tutorial at the domain root: the paste-in block, a generator for every attribute, a real slot driven by the published loader, and its diagnostic view.

## Block D — Banner rendering in HTML

- ✅ **RK11** **No HTML template turns a catalogue entry into a banner** — The renderer builds logo, product, headline, support, CTA and an Ad mark from JSON alone, as one labelled link inside the shadow root, with every string set as text.
- ✅ **RK12** **Only one banner size is imagined** — Four layouts over one entry: sidebar column, in-content rectangle, footer leaderboard and a compact strip, each fluid against its own slot with container queries and never the viewport.
- ✅ **RK13** **Colours, type and dark mode are hardcoded instead of declared** — Gradient, cta treatment and font are declared per entry from named options; theme is now optional with neutral defaults, and the gate refuses any pair below WCAG AA.
- ✅ **RK31** **The renderer clips any logo whose artwork reaches its corners** — border-radius is gone from the logo in every format, and a test refuses any rule that would clip or crop a mark.
- ✅ **RK14** **Banners have no accessibility or layout-shift budget** — Each format reserves its height before the request and keeps it as a floor, an empty slot gives the space back, and a page view is budgeted at 40KB with its heaviest logo.
- ✅ **RK41** **A banner keeps the theme it was drawn on after the page changes its own** — The slot watches prefers-color-scheme and data-ad-theme and repaints the campaign it already drew, so a page that turns light does not keep a dark card.

## Block E — Random rotation and delivery control

- ✅ **RK15** **Every visitor would see the same campaign** — Each slot draws in the browser from the whole catalogue, weighted by the declared field, and slots on one page exclude what the others already took.
- ✅ **RK16** **A site can advertise itself** — The pick drops any campaign whose destination or excludeHosts covers the host page, plus the slot's own excluded ids, tag filter, language and format, all before the draw.
- ✅ **RK17** **A returning reader keeps seeing the same pick** — The last four picks are demoted for thirty minutes from the host origin's own localStorage, holding ids and times only; unavailable storage costs the memory, never the banner.

## Block F — Metrics, quality and operations

- ✅ **RK24** **Three campaign destinations are not the product's canonical URL** — cursarei points at cursarei.com.br and is back in rotation, turing at turing.viglet.org and viglet at the www host its apex 301s to; all eight now answer 200 on the first hop.
- ✅ **RK25** **Nothing updates the actions the deploy runs on or the packages the gate validates with** — Dependabot now watches the deploy actions and the gate packages, opening one grouped pull request a month per ecosystem, with an ajv major arriving on its own.
- ✅ **RK26** **The deploy workflow pins actions three major versions behind** — Dependabot PR #1 bumped checkout and setup-node to v7 and both Pages actions to v5; the deploy went green on all four at once and the Node 20 warnings are gone.
- ✅ **RK28** **The network uses an advertiser's logo as its own icon** — site/brand/japode-ads.svg is the network's own mark, kept out of site/logos so the gate's unreferenced-asset warning stays about advertisers; it is the favicon and the header lockup.
- ✅ **RK30** **The snippet generator's form panel is crushed to one word wide** — minmax(0,1fr) on both grids and min-width:0 on their items, so a pre sizes to its share and scrolls inside it instead of sizing its track.
- ✅ **RK32** **The strip's text link is drawn inside a pill border** — The strip's cta rule now resets border and border-radius as well as the fill, and a test asserts it for all three treatments rather than the shipping one.
- ✅ **RK18** **Impressions and clicks are not counted** — Destinations carry utm_source, medium, campaign and content, so the product counts its own clicks with no request here; impressions are now a recorded non-goal.
- ✅ **RK20** **Nothing tests the renderer against the catalogue** — Every catalogue entry is drawn in all four formats and both themes, asserting a resolving logo, non-empty copy, the destination and the entry's own tokens in the stylesheet.
- ✅ **RK19** **There is no local preview of the catalogue** — npm run preview serves site/ with Pages' own headers and adds a gallery of every campaign in every format, pinned with data-ad-exclude rather than a preview-only attribute.
- ✅ **RK23** **The gate never checks that a campaign destination resolves** — A daily workflow requests every destination with a browser user agent, retries once before calling one dead, treats 401/403/405/429 as inconclusive and names redirects worth editing out.
- ✅ **RK27** **Nothing runs the origin check unless someone remembers to** — The origin check is a second job on the daily Health workflow, and now retries once before reporting, since a nightly job that cries wolf is one nobody reads.
- ✅ **RK29** **Nothing checks that the generator emits a snippet the loader reads back** — 11 tests feed the generator's output back through the loader's parser, and it found two: an unescaped quote emitting live markup, and no way to express an empty lang.
- ✅ **RK35** **A host site cannot decline the recency memory it stores** — data-ad-memory=off stops the loader reading or writing the host's localStorage at all, one slot silences the page, and the generator and attribute table both offer it.
- ✅ **RK36** **The catalogue's updated field is typed by hand and drifts** — The field is gone from the catalogue and refused by the gate: HTTP sends Last-Modified, an ETag and a 304, which check-origin now asserts so the argument for removing it stays true.
- 🗑 **RK33** **Half the loader a host page downloads is comments** — abandoned: The loader is the only place a site owner can verify the page's claims about tracking and storage, and 7.5KB is not worth making those unverifiable while the logo beside it costs 20KB.
- ✅ **RK34** **One logo is two thirds of what a page view downloads** — A zlib-only tool re-encodes the logos as indexed colour: viglet drops 20.6KB to 6.6KB, the worst page view 36KB to 22KB, and no dependency was added to do it.
- ✅ **RK38** **logo.alt is required by the schema and ignored by the renderer** — The renderer now writes the catalogue's alt, which aria-label on the link keeps out of the accessible name, so it serves the case it was written for: an image that did not load.
- ✅ **RK39** **Nothing checks that a deploy actually served what it uploaded** — A verify job runs check-deploy after the deployment step, comparing every file in site/ against what the domain serves, and it names truncation, an old version and a CRLF working copy apart.

## Block G — The project's public face

- ✅ **RK37** **A public repository explains itself only on the domain it publishes** — A README for whoever reads the source: what the network is, where the three parts live, how to run the gate and the preview, and that site/ is served byte for byte.
- ✅ **RK40** **The repository claims a licence it does not carry the text of** — The canonical Apache-2.0 text, identical to every sibling project's, plus a README section saying the logos are marks the licence's clause 6 grants no rights in.
