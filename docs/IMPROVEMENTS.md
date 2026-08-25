# Improvements

## Block F — Metrics, quality and operations

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
