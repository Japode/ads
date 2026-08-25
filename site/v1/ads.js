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

  /** Layout families a slot may ask for; the catalogue names the same three. */
  var FORMATS = ['sidebar', 'in-content', 'footer'];

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
          warnings: s.warnings.slice(),
        };
      }),
    };

    // One request for the whole page, however many slots asked. Started only when there
    // is a slot to fill: a page carrying the script and no container must cost nothing.
    if (slots.length) {
      loadCatalogue(win, now).then(function (catalogue) {
        win.japodeAds.campaigns = catalogue.campaigns.length;
        // Drawing belongs to the renderer and it is not here yet. Until then a slot that
        // got this far stays empty — which is also exactly what it must do when the
        // catalogue could not be read.
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
      start: start,
    };
  }
})();
