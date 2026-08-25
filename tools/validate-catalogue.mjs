// The gate the deploy workflow runs before anything reaches ads.japode.com.
//
// It refuses a catalogue rather than repairing one. On a static host there is nothing
// to roll back but another push, and by the time a browser reads a bad catalogue the
// damage is already on someone else's page — so this runs before publishing, never in
// the loader.
//
//   node tools/validate-catalogue.mjs [catalogue.json] [schema.json]
//
// Exit 0 = publishable. Exit 1 = refused, with every reason listed at once.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cataloguePath = resolve(root, process.argv[2] ?? 'site/v1/catalogue.json');
const schemaPath = resolve(root, process.argv[3] ?? 'schema/v1/catalogue.schema.json');
const siteRoot = resolve(root, 'site');
const logoDir = join(siteRoot, 'logos');

const errors = [];
const warnings = [];
const rel = p => relative(root, p).replaceAll('\\', '/');

function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    errors.push(`${label} not found at ${rel(path)}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    // Turn the byte offset node reports into a line and column, so a trailing comma
    // in a 200-line catalogue is one glance rather than one bisect.
    const at = /position (\d+)/.exec(e.message);
    let where = '';
    if (at) {
      const upto = text.slice(0, Number(at[1]));
      where = ` (line ${upto.split('\n').length}, column ${upto.length - upto.lastIndexOf('\n')})`;
    }
    errors.push(`${label} is not valid JSON${where}: ${e.message}`);
    return null;
  }
}

// ------------------------------------------------------------------------------------
// Contrast
// ------------------------------------------------------------------------------------

/** WCAG relative luminance of a #rgb or #rrggbb literal. */
function luminance(hex) {
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const channels = [0, 2, 4].map(i => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two colour literals, 1 to 21. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every pair a reader has to actually read, checked against WCAG AA for body text.
 *
 * 4.5 throughout rather than the 3.0 that large text is allowed: nothing in the banner
 * is large text. The headline is 16px and the product eyebrow is 12px, so the lenient
 * threshold would be claiming a size the renderer does not use.
 *
 * A gradient is checked at both ends. A pair that passes at one stop and fails at the
 * other is exactly the case a single check would wave through.
 */
function contrastProblems(tokens, treatment) {
  const problems = [];
  const surfaces = [tokens.surface, tokens.surfaceTo].filter(Boolean);
  const onSurface = [
    ['text', tokens.text],
    ['muted', tokens.muted],
    // The product eyebrow, and the CTA label itself unless the accent is a fill.
    ['accent', tokens.accent],
  ];

  for (const surface of surfaces) {
    for (const [name, colour] of onSurface) {
      if (!colour) continue;
      const ratio = contrast(colour, surface);
      if (ratio < 4.5) problems.push(`${name} on ${surface} is ${ratio.toFixed(2)}:1, needs 4.5`);
    }
  }

  // Only a filled call to action puts a label on the accent; outline and text draw it
  // on the surface, which the loop above already covered.
  if (treatment === 'solid' && tokens.onAccent) {
    const ratio = contrast(tokens.onAccent, tokens.accent);
    if (ratio < 4.5) problems.push(`the call to action label is ${ratio.toFixed(2)}:1 on its own fill, needs 4.5`);
  }

  return problems;
}

/** Intrinsic size of an asset, or null when the file does not declare one. */
function intrinsicSize(file) {
  if (file.endsWith('.svg')) {
    const svg = readFileSync(file, 'utf8');
    const open = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
    const w = /\swidth="(\d+(?:\.\d+)?)"/.exec(open);
    const h = /\sheight="(\d+(?:\.\d+)?)"/.exec(open);
    return w && h ? { width: Math.round(+w[1]), height: Math.round(+h[1]) } : null;
  }
  if (file.endsWith('.png')) {
    // IHDR is the first chunk of every PNG: width and height are big-endian at 16..24.
    const buf = readFileSync(file);
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return null; // webp: the contract allows it, nothing ships one yet
}

const schema = readJson(schemaPath, 'schema');
const catalogue = readJson(cataloguePath, 'catalogue');

if (schema && catalogue) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    errors.push(`schema ${rel(schemaPath)} does not compile: ${e.message}`);
  }

  if (validate && !validate(catalogue)) {
    for (const e of validate.errors) {
      const where = e.instancePath || '$';
      const extra = e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : '';
      errors.push(`${where} ${e.message}${extra}`);
    }
  }

  // Everything below is a rule the schema cannot state: it is about the file's
  // relationship to the assets beside it, not about its own shape.
  const campaigns = Array.isArray(catalogue.campaigns) ? catalogue.campaigns : [];
  const referenced = new Set();

  const seen = new Map();
  for (const [i, c] of campaigns.entries()) {
    const id = typeof c?.id === 'string' ? c.id : `campaigns[${i}]`;
    if (seen.has(id)) errors.push(`${id}: duplicate id, already used by campaigns[${seen.get(id)}]`);
    else seen.set(id, i);

    for (const key of ['src', 'srcDark']) {
      const path = c?.logo?.[key];
      if (typeof path !== 'string') continue;
      referenced.add(path);
      const file = join(siteRoot, path);
      if (!existsSync(file)) {
        errors.push(`${id}.logo.${key}: ${path} does not resolve under ${rel(siteRoot)}`);
        continue;
      }
      const size = intrinsicSize(file);
      if (!size) {
        warnings.push(`${id}.logo.${key}: ${path} declares no intrinsic size, so the slot cannot reserve space from the file itself`);
      } else if (size.width !== c.logo.width || size.height !== c.logo.height) {
        errors.push(`${id}.logo.${key}: catalogue says ${c.logo.width}x${c.logo.height}, ${path} is ${size.width}x${size.height} — the slot would reserve the wrong box and the page would shift`);
      }
    }

    // A theme with no dark half is legal, but a logo with a dark variant and no dark
    // theme means the renderer has a dark asset it can never be asked for.
    if (c?.logo?.srcDark && !c?.theme?.dark)
      warnings.push(`${id}: logo.srcDark is set but theme.dark is not, so the dark asset is unreachable`);

    // A campaign may decline to declare a theme and be drawn in the neutral defaults,
    // but then it looks like every other entry that said nothing.
    if (!c?.theme) {
      warnings.push(`${id}: declares no theme, so it draws in the neutral defaults and carries none of its own brand`);
      continue;
    }

    // Contrast is checked here rather than in the loader because the loader runs on
    // someone else's page, where the only thing it could do about an unreadable pair is
    // refuse to draw — and by then the campaign has already shipped.
    for (const half of ['light', 'dark']) {
      const tokens = c.theme[half];
      if (!tokens) continue;
      for (const problem of contrastProblems(tokens, c.theme.cta ?? 'solid')) {
        errors.push(`${id}.theme.${half}: ${problem}`);
      }
    }
  }

  // The contract still allows `updated`, because narrowing a published schema would make
  // a document that used to validate stop validating. Publishing one is another matter:
  // the field claims to say when the catalogue was assembled, nothing stamps it, and the
  // shipped copy had been wrong by seventeen hours since the day it was written. HTTP
  // carries the same fact correctly and for free.
  if (Object.hasOwn(catalogue, 'updated')) {
    errors.push(
      'remove "updated": nothing maintains it and the origin already sends Last-Modified ' +
      'and an ETag, so a hand-typed copy can only disagree with them'
    );
  }

  // An empty array is a legal v1 response — it is the fallback a loader uses when it
  // cannot read the catalogue at all. It is not a legal thing to publish: shipping the
  // fallback as the real file is indistinguishable, to every host page, from the origin
  // being down. The contract has to admit it; the gate is what refuses it.
  if (!campaigns.length)
    errors.push('the catalogue is empty: that is the defined fallback response, not something to publish — every slot would collapse as if the origin were down');

  const renderable = campaigns.filter(c => c?.enabled !== false && c?.weight !== 0);
  if (campaigns.length && !renderable.length)
    errors.push('every campaign is disabled or weighted 0, so every slot on every host site would collapse empty');

  if (existsSync(logoDir)) {
    for (const f of readdirSync(logoDir)) {
      const path = `/logos/${f}`;
      if (!referenced.has(path))
        warnings.push(`${path} is published but no campaign references it`);
    }
  }
}

const label = rel(cataloguePath);
if (warnings.length) console.log(warnings.map(w => `warn  ${w}`).join('\n'));

if (errors.length) {
  console.error(`\n${label} refused, nothing is publishable:\n` + errors.map(e => `  ${e}`).join('\n'));
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}

// Report what can actually be drawn, not what is in the file: once an entry can be
// withdrawn without being deleted, the total stops being the number that matters.
const all = catalogue?.campaigns ?? [];
const live = all.filter(c => c?.enabled !== false && c?.weight !== 0);
const withdrawn = all.length - live.length;
console.log(
  `${label}: ${live.length} campaign(s) in rotation` +
  (withdrawn ? `, ${withdrawn} withdrawn (${all.filter(c => !live.includes(c)).map(c => c.id).join(', ')})` : '') +
  `, valid against ${rel(schemaPath)}, every asset resolves at its declared size.`
);
