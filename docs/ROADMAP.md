# Roadmap (active backlog)

## Block F — Metrics, quality and operations

- 📋 **RK38** (deps: RK11 ✅) **logo.alt is required by the schema and ignored by the renderer** — The schema reader assumes it reaches the page and the banner auditor assumes it was forgotten; both are reading a deliberate choice. → §RK38
- 📋 **RK39** (deps: RK27 ✅, RK21 ✅) **Nothing checks that a deploy actually served what it uploaded** — Five logos were re-encoded today and a person fetching them by hand is what confirmed the domain served them. → §RK39

## Block G — The project's public face

- 📋 **RK37** (deps: —) **A public repository explains itself only on the domain it publishes** — Someone arriving at the source finds a directory listing and nothing saying what the project is or how to run its gate. → §RK37

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
