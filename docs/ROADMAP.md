# Roadmap (active backlog)

## Block D — Banner rendering in HTML

## Block E — Random rotation and delivery control

- 📋 **RK15** (deps: RK2 ✅, RK11 ✅) **Every visitor would see the same campaign** — The pick has to be random per page view, and weighted so one product can be pushed harder than another. → §RK15
- 📋 **RK16** (deps: RK15) **A site can advertise itself** — Turing pages should never render a Turing banner, and a slot may want to filter by tag or language. → §RK16
- 📋 **RK17** (deps: RK15) **A returning reader keeps seeing the same pick** — Without a short memory of what was already shown, rotation reads as a bug rather than as variety. → §RK17

## Block F — Metrics, quality and operations

- 📋 **RK18** (deps: RK11 ✅) **Impressions and clicks are not counted** — Nothing shows which product the network is actually sending readers to. → §RK18
- 📋 **RK19** (deps: RK11 ✅) **There is no local preview of the catalogue** — Reviewing how a banner looks should not require publishing it to production first. → §RK19
- 📋 **RK20** (deps: RK11 ✅, RK4 ✅) **Nothing tests the renderer against the catalogue** — A field renamed in the JSON would silently blank a banner on every host site. → §RK20
- 📋 **RK23** (deps: RK4 ✅) **The gate never checks that a campaign destination resolves** — It validates shape and assets offline, so a dead link passes and keeps passing until a reader reports it. → §RK23
- 📋 **RK27** (deps: RK6 ✅) **Nothing runs the origin check unless someone remembers to** — Pages could drop the cross-origin header and every banner would stop rendering at once, with no error anyone here can see. → §RK27
- 📋 **RK29** (deps: RK10 ✅, RK8 ✅) **Nothing checks that the generator emits a snippet the loader reads back** — A generator bug ships to every site that copied its output, onto pages we cannot reach to fix. → §RK29

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
