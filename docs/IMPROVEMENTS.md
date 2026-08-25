# Improvements

## Block F — Metrics, quality and operations

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
