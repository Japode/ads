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

  function start(win, doc) {
    var slots = findSlots(doc);

    for (var i = 0; i < slots.length; i++) {
      for (var j = 0; j < slots[i].warnings.length; j++) {
        warn(win, slots[i].slot + ': ' + slots[i].warnings[j]);
      }
    }

    // A read-only view of what the loader saw. A site owner asking "why is my slot
    // empty" has no other way to find out, since a slot that cannot render collapses
    // silently by design and leaves nothing to inspect.
    win.japodeAds = {
      version: 1,
      slots: slots.map(function (s) {
        return {
          slot: s.slot,
          format: s.format,
          theme: s.theme,
          lang: s.lang,
          tags: s.tags.slice(),
          exclude: s.exclude.slice(),
          warnings: s.warnings.slice(),
        };
      }),
    };

    return slots;
  }

  // Wait for the document rather than for load: the containers are what this needs, and
  // an async script can arrive either side of parsing.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { start(window, document); });
    } else {
      start(window, document);
    }
  }

  // Reachable when this file is evaluated with a document supplied by a test.
  if (typeof globalThis !== 'undefined') {
    globalThis.__japodeAdsInternals = {
      MARKER: MARKER,
      FORMATS: FORMATS,
      THEMES: THEMES,
      DEFAULTS: DEFAULTS,
      list: list,
      readSlot: readSlot,
      findSlots: findSlots,
      start: start,
    };
  }
})();
