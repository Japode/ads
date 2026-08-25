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

## Block E — Random rotation and delivery control

## Block F — Metrics, quality and operations

- ✅ **RK24** **Three campaign destinations are not the product's canonical URL** — cursarei points at cursarei.com.br and is back in rotation, turing at turing.viglet.org and viglet at the www host its apex 301s to; all eight now answer 200 on the first hop.
- ✅ **RK25** **Nothing updates the actions the deploy runs on or the packages the gate validates with** — Dependabot now watches the deploy actions and the gate packages, opening one grouped pull request a month per ecosystem, with an ajv major arriving on its own.
- ✅ **RK26** **The deploy workflow pins actions three major versions behind** — Dependabot PR #1 bumped checkout and setup-node to v7 and both Pages actions to v5; the deploy went green on all four at once and the Node 20 warnings are gone.
