# Roadmap (active backlog)

## Block A — Ad catalogue in JSON

- 📋 **RK44** (deps: —) **Revelei is not in the catalogue, so no site of the house ever shows it** — Revelei left Japode for its own page on 26/10/2026, and the owner put it in the rotation with weight 1 on 30/10/2026. → §RK44
- 📋 **RK45** (deps: —) **Modelado is not in the catalogue, though it has its own page and icon** — A product with a public page and its own logo goes in the catalogue, and Modelado pairs with Revelei as one line of offline AI apps. → §RK45

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
