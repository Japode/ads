# Improvements

## Block F — Metrics, quality and operations

## Block G — The project's public face

### §RK40 A licence claim with nothing behind it

package.json declares Apache-2.0 and no licence text is in the repository, so the claim
rests on one field in a manifest. For a public repository whose whole pitch is that a
stranger can read the loader before pasting it into their own page, that is the wrong
place for the terms to live and the wrong amount of them to state.

The declaration was written into package.json while building the publish gate, by
whoever needed the field filled, not by anybody choosing a licence. So this is two
questions and the second only follows the first: whether Apache-2.0 is the intended
licence for the catalogue, the loader and the tooling, and then supplying its text. The
logos are a separate matter again — they are product marks rather than code, and a
source licence has no business granting anything about them.
