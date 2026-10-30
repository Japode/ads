# Improvements

## Block A — Ad catalogue in JSON

### §RK44 Revelei in the catalogue

The PhotoBoost left Japode on 26/10/2026 and became Revelei (`alegauss/revelei`), with
its own page at https://alegauss.github.io/revelei/ and its own icon
(`site/public/icon.svg` in that repository). It is not in `site/v1/catalogue.json`. The
owner decided on 30/10/2026 that it enters with weight 1, like the others (visibility,
`produtos/japode-ads.md`); the weight-1 campaigns stay at 1 on purpose, so nothing else
moves.

The entry, in the shape the Windows apps already use (freewilly):

- `id` `revelei`, `product` "Revelei", the icon copied to `site/logos/revelei.svg` with its
  intrinsic size;
- copy from its page: the headline from "Your photos, the way you remember them", the
  support line from "No cloud, no account, nothing uploaded", the CTA to the page, never
  to the GitHub release, whose installer still carries the old name;
- the theme from the page's own accent, light and dark;
- `weight` 1, tags `photo`, `ai`, `windows`, `offline`, `lang` `["en"]`.

`npm run validate` passes and the served-file tests read the new logo.

### §RK45 Modelado in the catalogue

Modelado (`alegauss/modelado`) turns a photo of an object into a 3D model on the user's
own PC. It has a page at https://alegauss.github.io/modelado/ and its own icon
(`site/public/icon.svg` in that repository, the one the page shows), which is the rule
for entering this catalogue, and it is not in `site/v1/catalogue.json` (visibility,
`produtos/modelado.md`, 30/10/2026).

The 30/10/2026 portfolio review (visibility, `estrategia/portfolio.md`, "Apps Windows")
pairs it with Revelei as one line, "AI on your PC, nothing leaves it": a reader who sees
one should be able to meet the other, so both enter together, with the same weight.

The entry:

- `id` `modelado`, `product` "Modelado", the icon copied to `site/logos/modelado.svg`;
- copy from its page: "A photo becomes a 3D model you can turn, print and share", and
  "Nothing is uploaded"; the CTA to the page;
- the theme from the page's accent, light and dark;
- `weight` 1, tags `3d`, `ai`, `windows`, `offline`, `lang` `["en"]`.

`npm run validate` passes and the served-file tests read the new logo.
