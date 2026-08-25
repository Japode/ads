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

  /**
   * Defaults, which matter more than the attributes do: the minimal paste is
   * `<div data-japode-ads></div>` and it has to be a working slot, not a broken one.
   */
  var DEFAULTS = {
    format: 'in-content',
    theme: 'auto',
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
   * Every string here comes from the catalogue, and every one of them is set with
   * textContent rather than markup. A campaign is data, and data that can introduce
   * markup into someone else's page is an injection whether or not we wrote it.
   */
  function build(doc, campaign, tokens, logoSrc, origin, format, treatment) {
    var link = doc.createElement('a');
    link.className = 'unit ' + format;
    link.setAttribute('href', campaign.cta.href);
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
    product.textContent = campaign.product;

    var headline = doc.createElement('strong');
    headline.className = 'headline';
    headline.textContent = campaign.headline;

    var support = doc.createElement('span');
    support.className = 'support';
    support.textContent = campaign.support;

    var cta = doc.createElement('span');
    cta.className = 'cta';
    cta.textContent = campaign.cta.label;

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
    style.textContent = css(tokens, treatment);

    return { style: style, link: link };
  }

  /**
   * The unit's own stylesheet, scoped by the shadow root it is inserted into.
   *
   * Written out rather than assembled from the tokens by string interpolation of
   * arbitrary values: every substitution below is a colour the schema already
   * constrained to a hex literal, so none of it can close the declaration it sits in.
   */
  function css(t, treatment) {
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
      ':host { display: block; container-type: inline-size; }',
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
      '.unit.strip .cta { margin-top: 0; padding: 0; background: none; font-size: .8rem;',
      '  color: ' + t.accent + '; text-decoration: underline; text-underline-offset: 2px; }',
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
      if (!slots[k].root) {
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
      slots: slots.map(function (s) {
        return {
          slot: s.slot,
          format: s.format,
          theme: s.theme,
          lang: s.lang,
          tags: s.tags.slice(),
          exclude: s.exclude.slice(),
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

        for (var s = 0; s < slots.length; s++) {
          var slot = slots[s];
          if (!slot.root) continue;

          // Which campaign a slot gets is not this task's: weighting and per-slot
          // filtering arrive with rotation and delivery control. Taking the first
          // eligible entry is a seam, not a policy, and it is deliberately the least
          // interesting choice so that replacing it changes nothing about the template.
          var campaign = eligible(catalogue.campaigns)[0];

          // No campaign is not an error. The slot collapses, exactly as it does when the
          // catalogue could not be read at all, and nothing is drawn into the host page.
          if (!campaign) continue;

          win.japodeAds.slots[s].showing = draw(win, doc, slot, campaign, origin);
        }
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
      pickTheme: pickTheme,
      pickLogo: pickLogo,
      draw: draw,
      start: start,
    };
  }
})();
