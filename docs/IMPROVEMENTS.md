# Improvements

## Block A — Ad catalogue in JSON

## Block B — Static API on ads.japode.com

### §RK5 GitHub Pages under a custom domain

The site is published by GitHub Pages: the catalogue, the loader script and the logos
are all static files served from this repository. ads.japode.com is a custom domain on
the Pages site, which means a CNAME record on japode.com, the domain declared in the
repository, and enforced HTTPS so a snippet embedded on an https page is never blocked
as mixed content. No server logic exists anywhere in the design, and Pages is what holds
that constraint honest.

### §RK6 Living with fixed headers

Pages answers with a permissive cross-origin header already, which is what makes a
static catalogue readable from other domains at all; the task is to confirm it rather
than to configure it. Caching is the real constraint: Pages sets its own lifetime and
there is no header to override it, so a campaign edit reaches readers only when the URL
changes. The loader therefore requests the catalogue with a cache-busting parameter it
controls, and logos and versioned scripts stay on paths that never change so a long
lifetime is what we want there anyway.

### §RK7 Versioning and fallback

Serve under a version path so an incompatible schema ships alongside the old one instead
of replacing it. Pair it with a defined empty response: when the catalogue cannot be
read, the slot must collapse silently rather than leave a broken frame on someone else's
page.

### §RK21 Deploy workflow

A GitHub Actions workflow validates the catalogue, assembles the publishable files and
deploys them to Pages on every push to the default branch. It publishes from its own
site directory, not from the repository root and not from docs, which holds the governed
roadmap and changelog and must never be served. The schema gate runs inside this
workflow, so a catalogue that fails validation never reaches the domain.

## Block C — Embed snippet and JavaScript loader

### §RK8 The paste-in snippet

A container element carrying data attributes for slot, format and options, plus one
script tag. Nothing else. The attributes are the only configuration surface a host site
touches, so their names and defaults are as much a public contract as the catalogue
schema is.

### §RK9 Loader isolation

The script loads async and defers its work until the container is in the document. The
banner renders inside a shadow root so the host page cannot reach its styles and it
cannot leak its own. Everything it needs arrives in one catalogue request, reused across
every slot on the page.

### §RK10 Snippet documentation

A single page on the domain: what to paste, which formats exist, what each data
attribute does, and a small generator that emits the exact snippet for a chosen format
with a live preview beside it.

## Block D — Banner rendering in HTML

### §RK11 Banner template

The renderer walks the campaign entry and builds the markup: logo image, product name,
headline, one supporting line, a call-to-action button and the wrapping link. Every
string and every asset comes from the JSON, so a new campaign is a data edit and never a
code change. The template is written to look designed rather than served: real spacing,
a considered type scale, a visible hierarchy between headline and claim.

### §RK12 Formats and sizes

Several named formats over one campaign entry: a wide leaderboard, a rectangle, a tall
sidebar and a compact inline strip. Each rearranges the same fields rather than
requiring new ones, and each is fluid within its slot so a narrow column does not
overflow.

### §RK13 Theme tokens in the JSON

The entry declares its own tokens: background or gradient, text and accent colours, the
call-to-action treatment, an optional font pairing, and a second set for dark
surroundings. The renderer only reads tokens, so a product restyles its banner by
editing data. Defaults cover an entry that declares nothing, and a contrast check keeps
a badly chosen pair from shipping.

### §RK14 Accessibility and page weight

The slot reserves its height before the catalogue answers, so nothing jumps. Logos carry
alt text, the whole banner is one focusable link with a readable label, contrast is
checked against the declared tokens, and the rendered unit stays small enough that no
host page pays for it.

## Block E — Random rotation and delivery control

### §RK15 Weighted random pick

Selection happens in the browser from the full catalogue: draw one eligible campaign per
slot, weighted by the field the entry declares. Two slots on one page draw without
repeating each other. Nothing is decided on a server, which is what keeps the whole
network a static file.

### §RK16 Eligibility filters

The pick excludes any campaign whose destination is the host site itself, matched on
domain, and honours include and exclude tags plus a language field set on the slot. The
filter runs before the draw, so the weighting never has to compensate for an entry that
was never eligible.

### §RK17 Frequency and recency

The loader remembers the last few campaigns it rendered for this reader and demotes them
in the next draw, expiring the memory after a short window. Stored locally, no
identifier leaves the browser, and a reader whose storage is unavailable simply gets an
unweighted draw.

## Block F — Metrics, quality and operations

### §RK18 Click and impression accounting

Destination links carry campaign parameters so each product sees the traffic in its own
analytics, which needs no infrastructure here. Impressions are the harder half: decide
whether a count is worth a collector at all, and if it is, keep it aggregate and
cookieless.

### §RK19 Preview gallery

A local page renders every campaign in every format against light and dark backgrounds,
reading the working catalogue file. It is how a theme edit gets judged, and it doubles
as the screenshot source for the documentation page.

### §RK20 Renderer tests

Tests render each catalogue entry in each format and assert the parts that must exist: a
resolving logo, a non-empty headline, a destination link, applied theme tokens. Paired
with the schema gate, a catalogue edit then cannot reach production in a state the
renderer cannot draw.
