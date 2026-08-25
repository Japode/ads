# Roadmap (active backlog)

## Block B — Static API on ads.japode.com

## Block C — Embed snippet and JavaScript loader

- 📋 **RK8** (deps: RK5 ✅) **There is no HTML snippet a site owner can paste** — The whole product is one copy-paste block, the way an ad network ships one. → §RK8
- 📋 **RK9** (deps: RK8) **The loader would block rendering and inherit host page CSS** — An ad unit must never delay the page it sits on, nor let a host stylesheet distort the banner it draws. → §RK9
- 📋 **RK10** (deps: RK8) **No page documents the snippet or generates one** — Each site owner needs the slot formats, sizes and options without reading the loader source. → §RK10

## Block D — Banner rendering in HTML

- 📋 **RK11** (deps: RK1 ✅, RK9) **No HTML template turns a catalogue entry into a banner** — Logo, headline, supporting line and call to action all have to be assembled from JSON fields. → §RK11
- 📋 **RK12** (deps: RK11) **Only one banner size is imagined** — Sidebar, in-content and footer slots on host pages each need their own layout from the same entry. → §RK12
- 📋 **RK13** (deps: RK11) **Colours, type and dark mode are hardcoded instead of declared** — Each product carries its own brand, so the visual theme has to travel inside the campaign entry. → §RK13
- 📋 **RK14** (deps: RK11) **Banners have no accessibility or layout-shift budget** — An ad that shifts the page or hides its link text costs the host site more than it earns. → §RK14

## Block E — Random rotation and delivery control

- 📋 **RK15** (deps: RK2 ✅, RK11) **Every visitor would see the same campaign** — The pick has to be random per page view, and weighted so one product can be pushed harder than another. → §RK15
- 📋 **RK16** (deps: RK15) **A site can advertise itself** — Turing pages should never render a Turing banner, and a slot may want to filter by tag or language. → §RK16
- 📋 **RK17** (deps: RK15) **A returning reader keeps seeing the same pick** — Without a short memory of what was already shown, rotation reads as a bug rather than as variety. → §RK17

## Block F — Metrics, quality and operations

- 📋 **RK18** (deps: RK11) **Impressions and clicks are not counted** — Nothing shows which product the network is actually sending readers to. → §RK18
- 📋 **RK19** (deps: RK11) **There is no local preview of the catalogue** — Reviewing how a banner looks should not require publishing it to production first. → §RK19
- 📋 **RK20** (deps: RK11, RK4 ✅) **Nothing tests the renderer against the catalogue** — A field renamed in the JSON would silently blank a banner on every host site. → §RK20
- 📋 **RK23** (deps: RK4 ✅) **The gate never checks that a campaign destination resolves** — It validates shape and assets offline, so a dead link passes and keeps passing until a reader reports it. → §RK23

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
