# Improvements

## Block F — Metrics, quality and operations

### §RK38 Where logo.alt is actually used

The schema requires logo.alt on every campaign and every entry supplies it. The renderer
ignores it and writes alt="" instead, which is correct: the banner is one link labelled
with the product and the headline, so a logo that announced the product again would say
it twice to a screen reader.

Both halves are right and together they mislead. Someone reading the schema sees a
required field described as the image's alternative text and reasonably concludes it
reaches the page; someone auditing the rendered banner finds an empty alt and reasonably
concludes the catalogue forgot to supply one. Neither can tell from their own side that
the other is deliberate.

The fix is a decision about which one moves, not a fix to either. The field can stay
required with the schema saying out loud where it is used and where it is not, or it can
become optional, or the renderer can find the use the field was written for — a preview
listing, or an alt on a logo that fails to load, where nothing else names the product.

### §RK39 Verifying the deploy, not the day

The origin check runs daily and by hand, and neither catches the deploy that broke
something. Today five logos were re-encoded and the only thing that confirmed the domain
served valid PNGs at the right sizes was a person fetching them and reading their
headers, three separate times across the session.

The daily job is the wrong instrument for this. It answers whether Pages still behaves
the way the loader expects, on a cadence chosen so that a flaky socket cannot fail a
deploy. What is missing is narrower and immediate: after a deploy lands, did the domain
actually start serving what was uploaded. A deleted CNAME, an artifact assembled from
the wrong directory, a logo that arrived truncated — all of them survive a green deploy
and then wait for tomorrow.

It has to sit after the deployment step and never before it. A network check that can
block a publish is a network check that will one day block a good one, which is the
reason the daily job was kept out of the publish path in the first place; running after
the deploy has already succeeded marks the run without ever holding the domain hostage
to a socket.

## Block G — The project's public face

### §RK37 A README for whoever reads the source

The repository is public and has no README, so the only place the project explains
itself is the domain it publishes. Someone who arrives from a commit, a search or the
snippet pasted into a site they maintain lands on a directory listing of site/, tools/
and docs/ with nothing saying what any of it is.

What belongs here is not the documentation page rewritten. That page addresses a site
owner about to paste a block, and it should stay that. A README addresses somebody
reading the source: what the network is, that it publishes eight of our own products and
takes no third parties, where the three moving parts live, and how to run the gate, the
preview and the tests. The design rationale stays in the governed files and is not
pasted into it.

The one thing it has to state plainly is the property the whole repository is built on:
what site/ contains is what the domain serves, byte for byte, which is why the gate can
validate the real file and the preview can serve the real thing.
