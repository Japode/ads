# Roadmap (active backlog)

## Block E — Random rotation and delivery control

- 📋 **RK43** (deps: —) **Every product on one shared host hides the others, because self-exclusion compares the hostname alone** — alegauss.github.io serves claude-tray, roadkeep, freewilly and mini-gpt under paths, so each of their sites can only draw products on other domains. → §RK43

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
