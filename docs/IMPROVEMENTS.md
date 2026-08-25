# Improvements

## Block D — Banner rendering in HTML

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

### §RK23 Destination link checking

The publish gate reads the catalogue and the files beside it and never leaves the
machine. That is what lets it run on every push, but it means the one thing a banner
exists to do, send a reader somewhere, is the one thing nothing verifies. Eight
destinations shipped and one was already dead, found by hand rather than by the gate.

A destination rots with no edit to the catalogue: a repository turns private, a domain
lapses, a path moves. So the check belongs on a schedule and not in the publish path,
where a flaky network would block a deploy that changed nothing about the links. A job
that requests every href, follows redirects and reports what stopped answering turns a
silent 404 into a message, and a redirect that has become permanent into a catalogue
edit worth making.

What it must not do is trust a status code on its own. cursarei.com.br answers 403 to a
plain fetcher and 200 to a browser user agent, so a naive checker would have reported
the one destination that was working. Send a browser user agent, treat 403 and 429 as
inconclusive rather than dead, and require a failure to repeat on a second run before it
is reported at all.

### §RK27 The origin check needs a schedule

The origin check exists and passes, and nothing runs it. What it asserts is not ours to
set: Pages chooses the cross-origin header, the cache lifetime and the redirect, and the
product is built entirely on choices another party can change without telling us.

The failure is silent by construction. If Pages stopped sending the cross-origin header,
every banner on every host site would stop rendering at once, and nothing here would
record it — the error surfaces in a stranger's browser console, on a page we do not
control, to a reader with no reason to report it. The design has no monitoring anywhere
and is not meant to grow any, which is exactly why the one check that can see this must
run on a schedule instead of when somebody remembers.

It belongs on the same schedule as the destination check: both are network jobs that
must stay out of the publish path, and one job reporting both is one place to look.

### §RK29 The generator and the parser must agree

The loader is covered by tests against the file the domain serves. The generator that
tells a site owner what to paste is not covered by anything, and it is the more
dangerous of the two: the loader failing is one site's slot staying empty, while the
generator emitting a subtly wrong block is every site that copied it, each one carrying
the mistake away to a page we cannot reach or edit.

The cases are small and they are exactly the ones a reader would not notice: an
attribute whose value contains a quote, a tag list typed with stray commas, the
difference between an omitted attribute and an empty one — which the loader treats as
two different answers for lang. What the test has to assert is not that the generator
produces some string, but that the string it produces, fed back through the loader's own
parser, yields the configuration the site owner selected. The two halves of the contract
agreeing with each other is the only thing worth checking.
