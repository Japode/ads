# Improvements

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

### §RK33 Minifying costs the readable artifact

Measured while setting the page-weight budget: ads.js is 9.3KB gzipped, and 4.8KB of
that is comments. Stripping them halves the file. Those comments are why the loader is
maintainable and none of them are worth a browser downloading, on every host page,
forever.

What this costs is the property that site/ is the artifact. Today the served file is the
source file, tests run against the bytes the domain hands out, and the deploy workflow
copies a directory. A minifier makes site/v1/ads.js a source whose output is generated,
which means the tests have to keep running against the built file or they stop being
about what a host page receives.

That is the decision to weigh, not the 4.8KB. A build step is worth it if the minifier
is one dependency the deploy already has an excuse to install, and it is not worth it if
keeping the artifact readable and directly testable is the thing this project is for.

### §RK34 Quantizing needs a toolchain, not a resize

The budget is set at 40KB for a page view and the shipped worst case is 31KB, of which
the viglet logo alone is 20KB. Resizing from 256px to the 128px the banner can actually
use cut it from 35KB, and it is still two thirds of everything a reader downloads.

The remaining win is quantization, and it needs a tool this project does not have. The
resize went through .NET's encoder, which writes 32-bit RGBA and made claude-tray larger
than the 256px original it replaced — that file is still unresized for exactly this
reason. A palette encoder would take viglet to single digits and claude-tray below what
it is now.

So this is a dependency question rather than an image question: an image toolchain in
devDependencies, run once and committed, versus a static-files project that currently
installs nothing but a schema validator. Whatever is chosen, the per-logo ceiling the
tests now enforce is what keeps the answer honest.

### §RK35 Whose storage the memory lives in

The recency memory writes to the host site's own localStorage, which is the right origin
for privacy and the wrong one for consent: it is their storage, under their policy, and
a site operating under a consent banner has just acquired a write it never agreed to and
cannot see. The entry holds two campaign ids and a timestamp and follows nobody
anywhere, but a site owner auditing their own storage should not have to take that on
trust from a script they pasted.

So the slot needs to be able to say no, and the default is the argument. Off by default
makes the network worse at the thing rotation exists for, on almost every site, to
satisfy a minority of them. On by default with data-ad-memory="off" available puts the
choice where the obligation already is, with the site, and the documentation page is
where it stops being a surprise. Whichever way it lands, the loader must treat an absent
attribute and an unreadable storage identically, because it already does.

### §RK36 Stamp the field or drop it

The catalogue declares `updated` and the schema says it is when the file was assembled.
It is typed by hand and has not changed since the eight entries were written, so it is a
field that will be wrong for as long as nobody remembers it, which is the same as
always.

Either the deploy stamps it or the contract stops claiming it. Stamping is a line in the
workflow, but it means the published catalogue differs from the committed one, and this
project has spent every task so far keeping site/ the artifact — the gate validates the
file that ships, and the tests read the file the domain serves. Dropping the field costs
nothing anybody currently uses, since the loader never reads it and the cache-busting
token carries freshness instead.
