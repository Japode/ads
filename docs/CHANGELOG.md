# Shipped Ledger

## Block A — Ad catalogue in JSON

- ✅ **RK1** **No JSON schema describes an ad campaign** — schema/v1/catalogue.schema.json: cada campanha traz id, produto, logo com variante escura e tamanho intrinseco, headline, apoio, CTA, tema, peso, slots, tags, idioma e exclusao por host.
- ✅ **RK3** **Product logos have no hosted, stable URL** — site/logos/ at fixed paths: SVG for cursarei, mini-gpt, roadkeep and freewilly, 256px PNG for shio, turing, viglet and claude-tray, plus an explicit roadkeep-dark.svg.
- ✅ **RK2** **The eight launch products have no entry in the catalogue** — site/v1/catalogue.json holds all eight entries with copy, brand theme, weight, tags, language and self-exclusion; destinations taken from each product's own git remote or CNAME.

## Block B — Static API on ads.japode.com

## Block C — Embed snippet and JavaScript loader

## Block D — Banner rendering in HTML

## Block E — Random rotation and delivery control

## Block F — Metrics, quality and operations

