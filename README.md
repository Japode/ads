<div align="center">

<img src="site/brand/japode-ads.svg" alt="" width="120">

# Japode Ads

**A house ad network for the Japode and Viglet projects, published at
[ads.japode.com](https://ads.japode.com) as static files.**

</div>

Eight of our own products advertise each other. There is no ad server, no bidding, no
third-party advertisers and no billing — the whole network is a JSON catalogue, a loader
script and a folder of logos, and every decision about which banner to draw happens in
the reader's browser.

A site owner pastes two lines:

```html
<div data-japode-ads></div>
<script src="https://ads.japode.com/v1/ads.js" async></script>
```

[ads.japode.com](https://ads.japode.com) documents that snippet, generates one, and shows
the four formats live. This file is for whoever is reading the source.

## What site/ contains is what the domain serves

Byte for byte. There is no build step: the file in `site/v1/ads.js` is the file a host
page downloads, and a CI job compares every published file against the repository after
each deploy.

The whole repository leans on that. It is why the publish gate validates the real
catalogue rather than an intermediate, why the local preview serves the real loader, and
why the snippet tests can read the generator out of the published page and feed its output
back through the parser it has to agree with. Two tasks were turned down to keep it: the
loader ships with its comments, and the `updated` field was deleted rather than stamped at
deploy time.

## The three moving parts

| | |
|---|---|
| [`site/v1/catalogue.json`](site/v1/catalogue.json) | Every campaign. One entry carries everything a banner shows: logo, copy, destination, brand tokens, weight, and the filters that keep a product off its own site. |
| [`site/v1/ads.js`](site/v1/ads.js) | The loader. Finds slots, makes one catalogue request per page, draws each banner inside its own shadow root. |
| [`site/logos/`](site/logos/) | The artwork, at a fixed path per product, indexed-colour and sized for the largest a banner draws it. |

[`schema/v1/catalogue.schema.json`](schema/v1/catalogue.schema.json) is the contract all
three agree on. It is served too, and it is versioned: `/v1/` answers v1 for as long as
any pasted snippet points at it, and an incompatible change ships at `/v2/` beside it
rather than in place. Snippets live in pages we do not control.

## Working on it

```sh
npm ci
npm run validate    # refuse the catalogue before it can be published
npm test            # against the files the domain serves, not copies of them
npm run preview     # localhost:8080/preview — every campaign in every format
```

`npm run validate` is the gate the deploy runs, and it refuses rather than repairs: a
static host has nothing to roll back but another push. Two more checks need the network
and so stay out of the publish path, on a daily schedule instead: `npm run check-links`
and `npm run check-origin`.

`npm run optimise-logos` re-encodes the logos when one changes. It writes committed files,
so it is a tool and not a build step.

## Adding a campaign

Add an entry to the catalogue, put its logo in `site/logos/`, run `npm run optimise-logos`
and `npm run validate`, then look at it with `npm run preview`. The gate checks what the
schema cannot: that the asset resolves, that its declared size matches the file so the
host page does not jump, that no id repeats, and that the colours you chose clear WCAG AA
against each other.

## The roadmap is not edited by hand

[`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/CHANGELOG.md`](docs/CHANGELOG.md) and
[`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md) are written by
[roadkeep](https://github.com/alegauss/roadkeep), which refuses a hand edit. `docs/` is
never published — the deploy uploads `site/` and nothing else.

The roadmap's non-goals are worth reading before proposing anything: they are the
constraints the design is built out of, not a wishlist that ran out of time.

## Licence

The catalogue, the loader and the tooling are [Apache-2.0](LICENSE), matching every other
project in this family.

The logos in `site/logos/` are not covered by it. They are the marks of the products they
name, taken from those projects' own repositories, and clause 6 of the licence grants no
rights in a trade mark. Reuse of the code here is not permission to use anybody's logo.
