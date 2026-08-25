/*!
 * Japode Ads loader, v1 — https://ads.japode.com/v1/ads.js
 *
 * The paste-in snippet is one container and one script tag:
 *
 *   <div data-japode-ads data-ad-format="sidebar"></div>
 *   <script src="https://ads.japode.com/v1/ads.js" async></script>
 *
 * Every attribute below is a public contract, exactly as much as the catalogue schema
 * is. These snippets live in pages we do not control and cannot edit, so an attribute
 * name never changes meaning and an unknown one is ignored rather than fatal: a site
 * that pasted a v1 snippet keeps working when it is the only thing that never gets
 * revisited. A breaking change ships at /v2/ads.js beside this file, never in place.
 *
 * This file discovers slots and reads their configuration. It does not fetch and does
 * not draw — those arrive with the isolated loader and the renderer.
 */
(function () {
  'use strict';

  // Captured while this file is still executing, because currentScript is null by the
  // time any deferred work runs. It is how the loader finds its own origin: a copy
  // served from a local preview must fetch the catalogue beside it, not production.
  var SELF = typeof document !== 'undefined' ? document.currentScript : null;

  /** Marks a container as an ad slot. Its presence is the only thing required. */
  var MARKER = 'data-japode-ads';

  /** Layout families a slot may ask for; the catalogue names the same four. */
  var FORMATS = ['sidebar', 'in-content', 'footer', 'strip'];

  /** How a slot picks between a campaign's light and dark tokens. */
  var THEMES = ['auto', 'light', 'dark'];

  /** Whether a slot consents to the recency memory being stored on the host's origin. */
  var MEMORY_CHOICES = ['on', 'off'];

  /**
   * Defaults, which matter more than the attributes do: the minimal paste is
   * `<div data-japode-ads></div>` and it has to be a working slot, not a broken one.
   */
  var DEFAULTS = {
    format: 'in-content',
    theme: 'auto',
    memory: 'on',
  };

  /** A comma-separated attribute, emptied of blanks. Absent and "" both mean no filter. */
  function list(raw) {
    if (!raw) return [];
    return raw
      .split(',')
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(Boolean);
  }

  /** The page's own language, used when a slot does not name one. */
  function pageLang(doc) {
    var root = doc && doc.documentElement;
    var lang = root && root.getAttribute && root.getAttribute('lang');
    return lang ? lang.trim() : '';
  }

  /**
   * Read one container's configuration.
   *
   * Never throws and never returns null: a slot with a misspelled format still renders,
   * on the default, with a warning. Refusing to draw because a host site typed
   * "sidbar" would punish the reader for the site owner's typo, and the site owner is
   * not watching their console.
   */
  function readSlot(el, doc, index) {
    var warnings = [];
    // null when the attribute is absent, '' when it is present and empty. The two mean
    // different things for lang: absent asks to inherit the page's, empty opts out.
    var raw = function (name) {
      var v = el.getAttribute('data-ad-' + name);
      return v === null || v === undefined ? null : String(v).trim();
    };
    var attr = function (name) {
      var v = raw(name);
      return v === null ? '' : v;
    };

    var format = attr('format').toLowerCase();
    if (format && FORMATS.indexOf(format) === -1) {
      warnings.push(
        'data-ad-format="' + format + '" is not one of ' + FORMATS.join(', ') +
        '; falling back to "' + DEFAULTS.format + '"'
      );
      format = '';
    }

    var theme = attr('theme').toLowerCase();
    if (theme && THEMES.indexOf(theme) === -1) {
      warnings.push(
        'data-ad-theme="' + theme + '" is not one of ' + THEMES.join(', ') +
        '; falling back to "' + DEFAULTS.theme + '"'
      );
      theme = '';
    }

    var lang = raw('lang');

    var memory = attr('memory').toLowerCase();
    if (memory && MEMORY_CHOICES.indexOf(memory) === -1) {
      warnings.push(
        'data-ad-memory="' + memory + '" is not one of ' + MEMORY_CHOICES.join(', ') +
        '; falling back to "' + DEFAULTS.memory + '"'
      );
      memory = '';
    }

    return {
      el: el,
      // What this placement is called, for the site owner's own reading. Defaults to
      // something stable per page rather than random, so two loads name it the same.
      slot: attr('slot') || (format || DEFAULTS.format) + '-' + (index + 1),
      format: format || DEFAULTS.format,
      theme: theme || DEFAULTS.theme,
      // Absent means the page's own lang, so a Portuguese page does not get English
      // copy without its owner having to think about it. An explicit empty value opts
      // out and accepts a campaign in any language.
      lang: lang === null ? pageLang(doc) : lang,
      // Show only campaigns carrying one of these tags. Empty means no filter.
      tags: list(attr('tags')),
      // Never show these campaign ids here. This is how a product's own site avoids
      // advertising itself beyond what the catalogue already excludes.
      exclude: list(attr('exclude')),
      // Whether this slot consents to the recency memory being kept in the host site's
      // own localStorage. On by default: off by default would make rotation worse on
      // almost every site to satisfy a minority of them.
      memory: memory || DEFAULTS.memory,
      warnings: warnings,
    };
  }

  /** Every container on the page, in document order. */
  function findSlots(doc) {
    var nodes = doc.querySelectorAll('[' + MARKER + ']');
    var slots = [];
    for (var i = 0; i < nodes.length; i++) slots.push(readSlot(nodes[i], doc, i));
    return slots;
  }

  function warn(win, message) {
    if (win.console && win.console.warn) win.console.warn('[japode-ads] ' + message);
  }

  // ---------------------------------------------------------------------------------
  // The catalogue request
  // ---------------------------------------------------------------------------------

  /** What an unreadable catalogue means. The contract admits it; every slot collapses. */
  var EMPTY = { version: 1, campaigns: [] };

  /**
   * How long Pages caches the catalogue. Not ours to set — it is measured, and
   * `npm run check-origin` fails if it drifts far enough to matter.
   */
  var CACHE_SECONDS = 600;

  /** The origin this script was served from, so a preview copy stays self-contained. */
  function selfOrigin() {
    try {
      if (SELF && SELF.src) return new URL(SELF.src).origin;
    } catch (e) { /* a src we cannot parse is the same as no src */ }
    return 'https://ads.japode.com';
  }

  /**
   * A cache-busting token the loader controls.
   *
   * Bucketed to the lifetime Pages already serves rather than made unique per reader:
   * a unique URL per page view would make every request a cache miss and hand the host
   * page's readers a full round trip each. Bucketing keeps one URL shared by everyone
   * inside a window, so it still caches, while giving us the lever §RK6 said we need —
   * freshness becomes ours to choose instead of Pages'.
   */
  function bucket(nowMs) {
    return Math.floor(nowMs / (CACHE_SECONDS * 1000));
  }

  var pending = null;

  /**
   * The one catalogue request a page makes, whatever number of slots it has.
   *
   * Never rejects. Every failure — offline, a 404, HTML where JSON was expected, a
   * payload from a version this script does not speak — resolves to the empty response,
   * because the alternative is an unhandled rejection in someone else's page.
   */
  function loadCatalogue(win, now) {
    if (pending) return pending;
    var url = selfOrigin() + '/v1/catalogue.json?v=' + bucket(now);
    pending = win
      .fetch(url, { credentials: 'omit', mode: 'cors' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var usable = data && data.version === 1 && Object.prototype.toString.call(data.campaigns) === '[object Array]';
        return usable ? data : EMPTY;
      })
      .catch(function () {
        return EMPTY;
      });
    return pending;
  }

  // ---------------------------------------------------------------------------------
  // Isolation
  // ---------------------------------------------------------------------------------

  /**
   * Give a slot its own root.
   *
   * Open rather than closed: shadow DOM scopes CSS in both modes, which is the whole
   * requirement, and closed only hides the tree from the host page's JavaScript — no
   * defence against a site that could simply not paste the snippet, and a real cost to
   * the site owner trying to see why their slot is empty.
   *
   * Returns null where attachShadow does not exist. Drawing into the light DOM instead
   * would let the host stylesheet reach the banner, which is the thing this prevents,
   * so the slot stays empty rather than becoming a banner we cannot vouch for.
   */
  function isolate(slot) {
    var el = slot.el;
    if (!el.attachShadow) return null;
    return el.shadowRoot || el.attachShadow({ mode: 'open' });
  }

  /**
   * The height each format occupies once drawn, reserved before the catalogue answers.
   *
   * Derived from the type scale and the copy limits the schema enforces — a headline of
   * at most 60 characters and a supporting line of at most 140 — not measured from one
   * example. They are floors: the box never shrinks when the banner arrives, so any
   * error is a small downward growth rather than the page snapping upward.
   *
   * Reserving is the whole point. Without it the slot is zero-high until a network
   * round trip finishes, and the banner arriving shoves everything below it down the
   * page, on a site that agreed to carry an ad and not to have its article move.
   */
  var RESERVED = {
    'in-content': 140,
    sidebar: 200,
    footer: 96,
    strip: 42,
  };

  /**
   * Hold the space open before anything is drawn.
   *
   * Inserted at discovery time and not after the response, because the response is
   * exactly what it exists to be earlier than.
   */
  function reserve(doc, slot) {
    var style = doc.createElement('style');
    style.textContent = ':host { display: block; min-height: ' + (RESERVED[slot.format] || RESERVED['in-content']) + 'px; }';
    slot.root.appendChild(style);
  }

  /**
   * Give the space back.
   *
   * The one case where moving the page is right: nothing is going to be drawn, so
   * holding a blank gap open would make the host site pay for an ad it never got.
   */
  function collapse(doc, slot) {
    slot.root.textContent = '';
    var style = doc.createElement('style');
    style.textContent = ':host { display: none; }';
    slot.root.appendChild(style);
  }

  // ---------------------------------------------------------------------------------
  // The banner
  // ---------------------------------------------------------------------------------

  /**
   * Which half of a campaign's tokens to draw with.
   *
   * "auto" asks the reader's own browser rather than the host page, because a host page
   * that is dark has no way to tell us so — and matchMedia is the only signal that
   * crosses the shadow boundary without the host having to cooperate.
   */
  /**
   * What a campaign that declares no theme is drawn with.
   *
   * Neutral on purpose. A default that guessed at a brand would be wrong in a way the
   * advertiser never chose, and every undeclared entry looking alike is the honest
   * signal that none of them said anything.
   */
  var DEFAULT_THEME = {
    light: { accent: '#1f2937', onAccent: '#ffffff', surface: '#ffffff', text: '#111827', muted: '#4b5563', border: '#d1d5db' },
    dark: { accent: '#e5e7eb', onAccent: '#111827', surface: '#111827', text: '#f3f4f6', muted: '#9ca3af', border: '#374151' },
  };

  /** The three stacks a campaign may name. No webfont is ever fetched. */
  var FONTS = {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'ui-serif, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
  };

  var CTA_STYLES = ['solid', 'outline', 'text'];

  function pickTheme(win, slot, campaign) {
    var declared = campaign.theme || DEFAULT_THEME;
    var wanted = slot.theme;
    if (wanted === 'auto') {
      var dark = win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches;
      wanted = dark ? 'dark' : 'light';
    }
    // A campaign need only declare light; dark falls back to it rather than to a guess,
    // since a brand's own light palette on a dark card is wrong but legible, and an
    // inverted one we invented is neither.
    return declared[wanted] || declared.light || DEFAULT_THEME.light;
  }

  /** The presentation choices that are the same in both themes. */
  function pickTreatment(campaign) {
    var declared = campaign.theme || {};
    return {
      font: FONTS[declared.font] || FONTS.sans,
      cta: CTA_STYLES.indexOf(declared.cta) === -1 ? 'solid' : declared.cta,
    };
  }

  /** The logo file for this theme, falling back when the mark needs no dark variant. */
  function pickLogo(campaign, wantDark) {
    return (wantDark && campaign.logo.srcDark) || campaign.logo.src;
  }

  /** A flat surface, or a gradient when the entry declared a second stop. */
  function surfaceOf(t) {
    return t.surfaceTo
      ? 'linear-gradient(135deg, ' + t.surface + ' 0%, ' + t.surfaceTo + ' 100%)'
      : t.surface;
  }

  /**
   * The destination, tagged so the product can see this traffic in its own analytics.
   *
   * This is the whole of click accounting, and it needs nothing here: the count lives
   * with the advertiser, who already has somewhere to put it, and no request comes back
   * to this domain. A network that counted clicks itself would need a redirector, which
   * is a server, which is the thing the design does not have.
   *
   * What is deliberately absent is the host page. The browser's referrer already tells
   * the advertiser where a reader came from, and a site that set a referrer policy chose
   * to say less — writing the hostname into the URL would override that choice on their
   * behalf.
   *
   * A parameter the catalogue already set is never overwritten: the entry's author knew
   * something we do not.
   */
  function attributed(href, campaignId, format) {
    try {
      var url = new URL(href);
      var tags = {
        utm_source: 'japode-ads',
        utm_medium: 'banner',
        utm_campaign: campaignId,
        utm_content: format,
      };
      for (var key in tags) {
        if (Object.prototype.hasOwnProperty.call(tags, key) && !url.searchParams.has(key)) {
          url.searchParams.set(key, tags[key]);
        }
      }
      return url.toString();
    } catch (e) {
      // A href the browser cannot parse is one the gate should have refused. Send the
      // reader to it untagged rather than nowhere.
      return href;
    }
  }

  /**
   * Every string here comes from the catalogue, and every one of them is set with
   * textContent rather than markup. A campaign is data, and data that can introduce
   * markup into someone else's page is an injection whether or not we wrote it.
   */
  function build(doc, campaign, tokens, logoSrc, origin, format, treatment) {
    /**
     * Copy for one part of the banner.
     *
     * The gate refuses a catalogue missing any of these, so this only fires if one ever
     * reaches a browser anyway — and assigning a missing field to textContent puts the
     * literal word "undefined" on someone else's page. Blank is a hole; "undefined" is
     * a hole with our name on it.
     */
    var text = function (value) {
      return value === null || value === undefined ? '' : String(value);
    };

    var link = doc.createElement('a');
    link.className = 'unit ' + format;
    link.setAttribute('href', attributed(campaign.cta.href, campaign.id, format));
    link.setAttribute('rel', 'sponsored noopener');
    link.setAttribute('target', '_blank');
    // One focusable link for the whole unit, labelled with what it actually does, so a
    // screen reader is not handed "logo, heading, link" three times over.
    link.setAttribute('aria-label', campaign.cta.label + ' — ' + campaign.product + ': ' + campaign.headline);

    var img = doc.createElement('img');
    img.className = 'logo';
    img.setAttribute('src', origin + logoSrc);
    img.setAttribute('alt', '');
    // Declared in the catalogue and set as attributes: the box is reserved before the
    // file arrives, so the host page does not jump when it does.
    img.setAttribute('width', String(campaign.logo.width));
    img.setAttribute('height', String(campaign.logo.height));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');

    var body = doc.createElement('div');
    body.className = 'body';

    var product = doc.createElement('span');
    product.className = 'product';
    product.textContent = text(campaign.product);

    var headline = doc.createElement('strong');
    headline.className = 'headline';
    headline.textContent = text(campaign.headline);

    var support = doc.createElement('span');
    support.className = 'support';
    support.textContent = text(campaign.support);

    var cta = doc.createElement('span');
    cta.className = 'cta';
    cta.textContent = text(campaign.cta.label);

    // The one piece of text that is ours rather than the advertiser's. A reader is
    // entitled to know a banner is a banner without having to infer it.
    var mark = doc.createElement('span');
    mark.className = 'mark';
    mark.textContent = 'Ad';

    body.appendChild(product);
    body.appendChild(headline);
    body.appendChild(support);
    body.appendChild(cta);

    link.appendChild(img);
    link.appendChild(body);
    link.appendChild(mark);

    var style = doc.createElement('style');
    style.textContent = css(tokens, treatment, format);

    return { style: style, link: link };
  }

  /**
   * The unit's own stylesheet, scoped by the shadow root it is inserted into.
   *
   * Written out rather than assembled from the tokens by string interpolation of
   * arbitrary values: every substitution below is a colour the schema already
   * constrained to a hex literal, so none of it can close the declaration it sits in.
   */
  function css(t, treatment, format) {
    var border = t.border || t.accent;
    var muted = t.muted || t.text;
    var onAccent = t.onAccent || t.surface;
    var look = treatment || { font: FONTS.sans, cta: 'solid' };

    // Three treatments over the same accent. Only the fill changes: the label keeps its
    // weight and padding, so swapping treatment never changes what the unit measures.
    var ctaFill = {
      solid: '  background: ' + t.accent + '; color: ' + onAccent + '; border: 1px solid ' + t.accent + ';',
      outline: '  background: none; color: ' + t.accent + '; border: 1px solid ' + t.accent + ';',
      text: '  background: none; color: ' + t.accent + '; border: 1px solid transparent; padding-left: 0; padding-right: 0;' +
        ' text-decoration: underline; text-underline-offset: 3px;',
    }[look.cta];

    return [
      // Every format is fluid inside the slot it was given. The queries below are on the
      // container and never on the viewport, because the thing that decides whether a
      // banner fits is the column it sits in — a sidebar is narrow on a wide screen too.
      //
      // The reserved height stays as a floor after the banner arrives. Dropping it here
      // would let the box shrink to the drawn content, which is the same jump the
      // reservation exists to prevent, just later and upward.
      ':host { display: block; container-type: inline-size;',
      '  min-height: ' + (RESERVED[format] || RESERVED['in-content']) + 'px; }',
      '* { box-sizing: border-box; }',

      // ---- shared -------------------------------------------------------------------
      '.unit {',
      '  display: flex; position: relative; text-decoration: none;',
      '  gap: .875rem; align-items: flex-start;',
      '  padding: 1rem; border-radius: 12px;',
      '  border: 1px solid ' + border + ';',
      '  background: ' + surfaceOf(t) + '; color: ' + t.text + ';',
      '  font: 400 15px/1.5 ' + look.font + ';',
      '  transition: border-color .15s ease;',
      '}',
      '.unit:hover { border-color: ' + t.accent + '; }',
      '.unit:focus-visible { outline: 2px solid ' + t.accent + '; outline-offset: 2px; }',
      // No border-radius on the mark. border-radius clips an <img>, and a logo already
      // carries whatever shape its owner gave it: Shio ships a rounded red tile with
      // lettering that reaches the corner, so rounding it again cut the corner off.
      // Restyling an advertiser's mark is not ours to do, and the failure is invisible
      // for the marks that happen to have empty corners.
      '.logo { flex: 0 0 auto; width: 40px; height: auto; }',
      '.body { display: flex; flex-direction: column; gap: .2rem; min-width: 0; }',
      '.product { font-size: .75rem; font-weight: 600; letter-spacing: .04em;',
      '  text-transform: uppercase; color: ' + t.accent + '; }',
      '.headline { font-size: 1rem; font-weight: 650; line-height: 1.3; letter-spacing: -.01em; }',
      '.support { font-size: .875rem; color: ' + muted + '; }',
      '.cta { margin-top: .4rem; align-self: flex-start; white-space: nowrap;',
      '  padding: .35rem .75rem; border-radius: 999px; font-size: .8rem; font-weight: 600;',
      ctaFill,
      '}',
      // The disclosure never competes with the content and never disappears.
      '.mark { position: absolute; top: .5rem; right: .625rem;',
      '  font-size: .625rem; letter-spacing: .08em; text-transform: uppercase;',
      '  color: ' + muted + '; opacity: .75; }',

      // ---- sidebar: a tall column ---------------------------------------------------
      '.unit.sidebar { flex-direction: column; gap: .75rem; }',
      '.unit.sidebar .logo { width: 48px; }',
      '.unit.sidebar .cta { align-self: stretch; text-align: center; }',

      // ---- in-content: a rectangle inside an article --------------------------------
      // The default shape: logo beside the copy, nothing hidden.

      // ---- footer: a wide leaderboard -----------------------------------------------
      // One row, the call to action pushed to the far end so a wide slot does not leave
      // it stranded mid-line. The support text is what gives way when the row tightens.
      '.unit.footer { align-items: center; gap: 1rem; padding: .875rem 1.25rem; }',
      '.unit.footer .body { flex: 1 1 auto; }',
      '.unit.footer .cta { margin-top: 0; margin-left: auto; align-self: center; }',
      '.unit.footer .mark { position: static; margin-left: .5rem; align-self: center; }',
      '@container (max-width: 34rem) { .unit.footer .support { display: none; } }',

      // ---- strip: one compact line --------------------------------------------------
      // Deliberately the least of the four. It carries the product, the headline and the
      // link, and drops the supporting sentence rather than shrink type until nothing is
      // readable — a strip that has to be squinted at is worse than a shorter one.
      '.unit.strip { align-items: center; gap: .625rem; padding: .5rem .75rem; border-radius: 8px; }',
      '.unit.strip .logo { width: 24px; }',
      '.unit.strip .body { flex: 1 1 auto; flex-direction: row; align-items: baseline; gap: .5rem; }',
      '.unit.strip .support { display: none; }',
      '.unit.strip .product { font-size: .7rem; flex: 0 0 auto; }',
      '.unit.strip .headline { font-size: .875rem; font-weight: 600;',
      '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      // The strip's call to action is a text link, so it has to undo the whole pill and
      // not only its fill: the border and the 999px radius survive a background:none and
      // draw an ellipse hugging the label once the padding is gone.
      '.unit.strip .cta { margin-top: 0; padding: 0; background: none; border: 0;',
      '  border-radius: 0; font-size: .8rem; color: ' + t.accent + ';',
      '  text-decoration: underline; text-underline-offset: 2px; }',
      '.unit.strip .mark { position: static; flex: 0 0 auto; margin-left: .25rem; }',
      '@container (max-width: 26rem) { .unit.strip .product { display: none; } }',

      // ---- narrow anything ----------------------------------------------------------
      // Below this the row shape stops working for the two formats that use one, so they
      // become the column the sidebar always was.
      '@container (max-width: 20rem) {',
      '  .unit:not(.strip) { flex-direction: column; gap: .625rem; }',
      '  .unit:not(.strip) .logo { width: 32px; }',
      '  .unit.footer .cta { margin-left: 0; align-self: flex-start; }',
      '}',

      '@media (prefers-reduced-motion: reduce) { .unit { transition: none; } }',
    ].join('\n');
  }

  // ---------------------------------------------------------------------------------
  // Eligibility
  // ---------------------------------------------------------------------------------

  /** The hostname of a URL, or '' when it cannot be read. */
  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  /**
   * Does `host` fall under `domain`?
   *
   * Suffix matching on a label boundary, so listing viglet.org covers
   * docs.viglet.org without listing it, and never covers notviglet.org.
   */
  function under(host, domain) {
    if (!host || !domain) return false;
    domain = domain.toLowerCase();
    return host === domain || host.slice(-(domain.length + 1)) === '.' + domain;
  }

  /**
   * Is this campaign about the page it would be drawn on?
   *
   * Two sources, because they answer different halves. The catalogue's excludeHosts is
   * what a product uses to name the sites it owns; the destination's own hostname is
   * the case nobody remembers to list — a page linking to itself is an advertisement
   * for where the reader already is.
   */
  function advertisesHost(campaign, host) {
    if (!host) return false;
    if (under(host, hostOf(campaign.cta.href))) return true;
    var listed = campaign.excludeHosts || [];
    for (var i = 0; i < listed.length; i++) {
      if (under(host, listed[i])) return true;
    }
    return false;
  }

  /** The primary subtag: pt-BR and pt are the same language for this purpose. */
  function primary(tag) {
    return String(tag || '').toLowerCase().split('-')[0];
  }

  /**
   * Everything a slot may draw, in catalogue order.
   *
   * Filtering happens here rather than inside the draw so the weighting never has to
   * compensate for an entry that was never eligible: a campaign removed for language
   * takes its weight with it, and the remaining shares stay in the proportion the
   * catalogue declared.
   */
  function eligibleFor(pool, slot, host) {
    var out = [];
    for (var i = 0; i < pool.length; i++) {
      var c = pool[i];

      if (advertisesHost(c, host)) continue;
      if (slot.exclude.indexOf(c.id) !== -1) continue;

      // A campaign may name the formats it was written for; absent means all of them.
      if (c.slots && c.slots.indexOf(slot.format) === -1) continue;

      // An include filter: the slot names the topics it will carry, and an entry has to
      // match one. A campaign with no tags matches no filter, which is the honest
      // reading of a slot that asked for a topic.
      if (slot.tags.length) {
        var tagged = false;
        var tags = c.tags || [];
        for (var t = 0; t < tags.length && !tagged; t++) {
          if (slot.tags.indexOf(tags[t]) !== -1) tagged = true;
        }
        if (!tagged) continue;
      }

      // A campaign that declares no language is copy that reads anywhere, so it is
      // never filtered out by one.
      if (slot.lang && c.lang && c.lang.length) {
        var wanted = primary(slot.lang);
        var speaks = false;
        for (var l = 0; l < c.lang.length && !speaks; l++) {
          if (primary(c.lang[l]) === wanted) speaks = true;
        }
        if (!speaks) continue;
      }

      out.push(c);
    }
    return out;
  }

  /** A campaign's share of the draw. Absent means 1, which is what most entries want. */
  function weightOf(c) {
    return typeof c.weight === 'number' ? c.weight : 1;
  }

  /**
   * Draw one campaign, weighted by the field the entry declares.
   *
   * Walks the cumulative weight rather than building a bucket array: an entry may
   * declare 0.5, so there is nothing to repeat an integer number of times, and a
   * catalogue of eight does not need the index.
   *
   * `random` is a parameter because the alternative is a test hook in shipped code.
   */
  function drawWeighted(pool, random, weigh) {
    weigh = weigh || weightOf;
    if (!pool.length) return null;
    var total = 0;
    var i;
    for (i = 0; i < pool.length; i++) total += weigh(pool[i]);
    if (total <= 0) return null;

    var point = random() * total;
    for (i = 0; i < pool.length; i++) {
      point -= weigh(pool[i]);
      // Strictly less than zero, so an entry weighted 0 can never be landed on by a
      // point that merely reached it.
      if (point < 0) return pool[i];
    }
    // Only reachable through floating-point drift at the very top of the range.
    return pool[pool.length - 1];
  }

  /**
   * One campaign for this slot, avoiding what the other slots on the page already took.
   *
   * Two banners for the same product stacked down one page reads as a bug, so the
   * already-drawn are removed before the draw rather than redrawn after a collision —
   * a retry loop on a catalogue smaller than the number of slots never terminates.
   *
   * When the page asks for more slots than there are campaigns, repeating is the right
   * answer: an empty slot is worse than a second sighting, and the site owner chose how
   * many slots to place.
   */
  function pickFor(pool, taken, random, weigh) {
    var fresh = [];
    for (var i = 0; i < pool.length; i++) {
      if (taken.indexOf(pool[i].id) === -1) fresh.push(pool[i]);
    }
    return drawWeighted(fresh.length ? fresh : pool, random, weigh);
  }

  // ---------------------------------------------------------------------------------
  // A short memory
  // ---------------------------------------------------------------------------------

  /**
   * Where the last few picks are noted.
   *
   * This is the host site's localStorage, not ours — the loader runs on their page, so
   * the entry is scoped to their origin and a reader on two different sites has two
   * unrelated memories. That is not a limitation to work around: it is what keeps a
   * feature about variety from becoming the cross-site profile this network refuses to
   * build. Nothing here is ever sent anywhere, and there is no identifier to send.
   */
  var MEMORY_KEY = 'japode-ads.v1.recent';

  /** How long a sighting counts for. Past this, variety stops mattering. */
  var MEMORY_MINUTES = 30;

  /** How many sightings are kept. Longer than the number of slots on a typical page. */
  var MEMORY_SIZE = 4;

  /**
   * What a recent sighting does to a campaign's share.
   *
   * Demoted and not excluded. On a catalogue of eight with four remembered, excluding
   * would narrow the draw to the remainder and make rotation predictable in the other
   * direction; and where every eligible entry has been seen, exclusion leaves nothing
   * to draw at all.
   */
  var DEMOTION = 0.15;

  /** localStorage, or null where reading it throws — private modes do. */
  function storage(win) {
    try {
      var s = win.localStorage;
      // Touching the object is not enough: some browsers only throw on use.
      s.getItem(MEMORY_KEY);
      return s;
    } catch (e) {
      return null;
    }
  }

  /** The campaign ids seen recently, newest first, expired entries dropped. */
  function recent(win, now) {
    var s = storage(win);
    if (!s) return [];
    var parsed;
    try {
      parsed = JSON.parse(s.getItem(MEMORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
    if (Object.prototype.toString.call(parsed) !== '[object Array]') return [];

    var cutoff = now - MEMORY_MINUTES * 60 * 1000;
    var ids = [];
    for (var i = 0; i < parsed.length; i++) {
      var entry = parsed[i];
      if (entry && typeof entry.id === 'string' && typeof entry.at === 'number' && entry.at > cutoff) {
        ids.push(entry);
      }
    }
    return ids;
  }

  /** Note what was drawn. Failing to write is not worth telling anyone about. */
  function remember(win, now, previous, drawn) {
    var s = storage(win);
    if (!s || !drawn.length) return;
    var next = [];
    for (var i = 0; i < drawn.length; i++) next.push({ id: drawn[i], at: now });
    for (var j = 0; j < previous.length && next.length < MEMORY_SIZE; j++) {
      var keep = true;
      for (var k = 0; k < next.length && keep; k++) {
        if (next[k].id === previous[j].id) keep = false;
      }
      if (keep) next.push(previous[j]);
    }
    try {
      s.setItem(MEMORY_KEY, JSON.stringify(next.slice(0, MEMORY_SIZE)));
    } catch (e) { /* full, or refused: the reader still gets a banner */ }
  }

  /** A weight function that pushes recently seen campaigns down the draw. */
  function demoting(seen) {
    var ids = [];
    for (var i = 0; i < seen.length; i++) ids.push(seen[i].id);
    return function (c) {
      return ids.indexOf(c.id) === -1 ? weightOf(c) : weightOf(c) * DEMOTION;
    };
  }

  /** Campaigns a slot may draw at all: withdrawn and zero-weighted entries are out. */
  function eligible(campaigns) {
    var out = [];
    for (var i = 0; i < campaigns.length; i++) {
      var c = campaigns[i];
      if (!c || c.enabled === false || c.weight === 0) continue;
      // A theme is not required: an entry without one draws in the neutral defaults.
      // What cannot be defaulted is where the banner sends the reader and what it shows.
      if (!c.cta || !c.cta.href || !c.logo || !c.logo.src) continue;
      out.push(c);
    }
    return out;
  }

  /** Draw one campaign into one slot, replacing whatever was there. */
  function draw(win, doc, slot, campaign, origin) {
    var wantDark = slot.theme === 'dark' ||
      (slot.theme === 'auto' && !!(win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches));
    var parts = build(
      doc, campaign,
      pickTheme(win, slot, campaign),
      pickLogo(campaign, wantDark),
      origin, slot.format,
      pickTreatment(campaign)
    );
    slot.root.textContent = '';
    slot.root.appendChild(parts.style);
    slot.root.appendChild(parts.link);
    return campaign.id;
  }

  function start(win, doc, now) {
    var slots = findSlots(doc);

    for (var i = 0; i < slots.length; i++) {
      for (var j = 0; j < slots[i].warnings.length; j++) {
        warn(win, slots[i].slot + ': ' + slots[i].warnings[j]);
      }
    }

    for (var k = 0; k < slots.length; k++) {
      slots[k].root = isolate(slots[k]);
      if (slots[k].root) {
        // Before the request, not after it: holding the space open is only worth
        // anything if it happens earlier than the thing it is waiting for.
        reserve(doc, slots[k]);
      } else {
        slots[k].warnings.push('this browser has no shadow DOM, so the slot stays empty rather than inherit the page stylesheet');
        warn(win, slots[k].slot + ': ' + slots[k].warnings[slots[k].warnings.length - 1]);
      }
    }


    // A read-only view of what the loader saw. A site owner asking "why is my slot
    // empty" has no other way to find out, since a slot that cannot render collapses
    // silently by design and leaves nothing to inspect.
    win.japodeAds = {
      version: 1,
      // null until the one request settles; a number after, 0 included. A site owner
      // seeing 0 knows the catalogue answered and had nothing, which is a different
      // problem from null, where it never answered at all.
      campaigns: null,
      // 'on' or 'off' once the draw runs: whether this page consented to the recency
      // memory. Null before then, like campaigns.
      memory: null,
      slots: slots.map(function (s) {
        return {
          slot: s.slot,
          format: s.format,
          theme: s.theme,
          lang: s.lang,
          tags: s.tags.slice(),
          exclude: s.exclude.slice(),
          memory: s.memory,
          isolated: !!s.root,
          // The campaign id this slot ended up drawing, or null if it drew nothing.
          showing: null,
          warnings: s.warnings.slice(),
        };
      }),
    };

    // One request for the whole page, however many slots asked. Started only when there
    // is a slot to fill: a page carrying the script and no container must cost nothing.
    if (slots.length) {
      var origin = selfOrigin();
      loadCatalogue(win, now).then(function (catalogue) {
        win.japodeAds.campaigns = catalogue.campaigns.length;

        // Every decision here is made in the reader's browser from the whole catalogue.
        // Nothing is asked of a server, which is what keeps the network a static file.
        var pool = eligible(catalogue.campaigns);
        var random = (win.Math || Math).random;
        var host = (win.location && win.location.hostname || '').toLowerCase();
        var taken = [];

        // One "off" anywhere on the page silences the memory for all of it.
        //
        // Consent belongs to the site, not to a slot, and the storage is a single key on
        // their origin — there is no coherent way for one slot to keep a memory another
        // declined. A site owner who wrote the opt-out once and pasted a second snippet
        // without it meant off, and the conservative reading is the only safe one when
        // the obligation is theirs and the write is ours.
        var consented = true;
        for (var m = 0; m < slots.length; m++) {
          if (slots[m].memory === 'off') consented = false;
        }
        win.japodeAds.memory = consented ? 'on' : 'off';

        // A reader whose storage is unavailable gets an empty memory and an undemoted
        // draw, which is the ordinary weighted one. Variety is worth less than a banner.
        // Declining is deliberately the same path: absent attribute, unreadable storage
        // and an explicit "off" all arrive here as an empty memory.
        var seen = consented ? recent(win, now) : [];
        var weigh = demoting(seen);

        for (var s = 0; s < slots.length; s++) {
          var slot = slots[s];
          if (!slot.root) continue;

          // Per slot, not once for the page: two slots can ask for different topics or
          // languages, and the host exclusion is the only part they share.
          var campaign = pickFor(eligibleFor(pool, slot, host), taken, random, weigh);

          // No campaign is not an error. The slot gives its reserved space back and
          // collapses, exactly as it does when the catalogue could not be read at all.
          if (!campaign) {
            collapse(doc, slot);
            continue;
          }

          taken.push(campaign.id);
          win.japodeAds.slots[s].showing = draw(win, doc, slot, campaign, origin);
        }

        // Written once for the page rather than per slot, so the memory holds this
        // page view and not the order its slots happened to be drawn in. Skipped
        // entirely when the site declined: not a shorter write, no write.
        if (consented) remember(win, now, seen, taken);
      });
    }

    return slots;
  }

  // Wait for the document rather than for load: the containers are what this needs, and
  // an async script can arrive either side of parsing.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        start(window, document, Date.now());
      });
    } else {
      start(window, document, Date.now());
    }
  }

  // Reachable when this file is evaluated with a document supplied by a test.
  if (typeof globalThis !== 'undefined') {
    globalThis.__japodeAdsInternals = {
      MARKER: MARKER,
      FORMATS: FORMATS,
      THEMES: THEMES,
      MEMORY_CHOICES: MEMORY_CHOICES,
      DEFAULTS: DEFAULTS,
      CACHE_SECONDS: CACHE_SECONDS,
      EMPTY: EMPTY,
      list: list,
      readSlot: readSlot,
      findSlots: findSlots,
      selfOrigin: selfOrigin,
      bucket: bucket,
      loadCatalogue: loadCatalogue,
      isolate: isolate,
      eligible: eligible,
      eligibleFor: eligibleFor,
      advertisesHost: advertisesHost,
      under: under,
      weightOf: weightOf,
      drawWeighted: drawWeighted,
      pickFor: pickFor,
      MEMORY_KEY: MEMORY_KEY,
      MEMORY_MINUTES: MEMORY_MINUTES,
      MEMORY_SIZE: MEMORY_SIZE,
      DEMOTION: DEMOTION,
      recent: recent,
      remember: remember,
      demoting: demoting,
      RESERVED: RESERVED,
      reserve: reserve,
      collapse: collapse,
      attributed: attributed,
      pickTheme: pickTheme,
      pickLogo: pickLogo,
      draw: draw,
      start: start,
    };
  }
})();
