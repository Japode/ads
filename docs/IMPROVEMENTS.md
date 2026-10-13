# Improvements

## Block E — Random rotation and delivery control

### §RK43 Self-exclusion compares the path on a shared host

`advertisesHost` drops a campaign when the host page sits under its destination's
hostname. That was right for products with their own domain (shio.viglet.org,
cursarei.com.br), and wrong for GitHub Pages project sites:
alegauss.github.io/claude-tray, /roadkeep, /freewilly and /mini-gpt all share one
hostname, so on any of those pages every one of the four counts as "the page itself" and
is dropped.

The effect on 13/10/2026: the claude-tray site, the one with real traffic, can only draw
Shio, Turing, Viglet and cursarei, never roadkeep, which is the audience it shares. A
slot asking for `data-tags` that only alegauss.github.io products carry would draw
nothing at all.

The fix compares the destination's path as well when the host page shares its hostname:
a campaign is about this page when the page's host is under the destination host and the
page's path starts with the destination's path. `excludeHosts` keeps meaning a whole
host. The rule lives in `/v1/ads.js`, which pasted snippets load, so the change must
keep every current domain-level exclusion as it is.

Done when: on alegauss.github.io/claude-tray the pick can land on roadkeep and never on
claude-tray, and a test covers two products under one host.
