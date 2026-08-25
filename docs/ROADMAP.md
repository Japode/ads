# Roadmap (active backlog)

## Block F — Metrics, quality and operations

- 📋 **RK27** (deps: RK6 ✅) **Nothing runs the origin check unless someone remembers to** — Pages could drop the cross-origin header and every banner would stop rendering at once, with no error anyone here can see. → §RK27
- 📋 **RK29** (deps: RK10 ✅, RK8 ✅) **Nothing checks that the generator emits a snippet the loader reads back** — A generator bug ships to every site that copied its output, onto pages we cannot reach to fix. → §RK29
- 📋 **RK33** (deps: RK14 ✅) **Half the loader a host page downloads is comments** — ads.js is 9.3KB gzipped and 4.8KB of that is prose no browser reads, paid for on every page view. → §RK33
- 📋 **RK34** (deps: RK14 ✅) **One logo is two thirds of what a page view downloads** — viglet.png is 20KB of a 31KB worst case, and cutting it further needs a palette encoder this project has no tool for. → §RK34
- 📋 **RK35** (deps: RK17 ✅) **A host site cannot decline the recency memory it stores** — The loader writes to their localStorage under their consent policy, and a site under a banner never agreed to it. → §RK35
- 📋 **RK36** (deps: RK21 ✅) **The catalogue's updated field is typed by hand and drifts** — It claims to say when the file was assembled, nothing stamps it, and the loader never reads it either. → §RK36

## Non-goals

- **No ad server or real-time bidding** The whole network is a static JSON file and a
  script; selection happens in the browser, and adding a backend would undo that.
- **No third-party or paid advertisers** The inventory is our own products only, so
  there is no billing, no advertiser account and no approval workflow to build.
- **No visitor tracking or profiling** Nothing identifies a reader across sites;
  rotation memory stays local to the browser and no personal data is collected.
- **No self-service campaign UI** Campaigns are edited as JSON in this repository,
  reviewed like code; an admin interface would cost more than eight entries are worth.
- **No iframe-based ad slots** The banner renders inline in a shadow root, which keeps
  it responsive and light in a way a fixed-size iframe cannot be.
- **No impression counting** Any collector is a server or a third party, and both are
  already refused; the advertiser's own click data is the number that decides whether
  advertising here is worth it.
