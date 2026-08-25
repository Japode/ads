# Improvements

## Block F — Metrics, quality and operations

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
