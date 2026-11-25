# Khai & Kai vector art

This directory contains the Night Coop chicken renderer kit, hatch illustrations, brand marks, and generated review page. Breed, sex, and plumage indexes in `kit.json` follow SPEC.md trait IDs.

## Files

- `kit.json` is the compact on-chain shape, colour, breed, and sex definition. Its path-data strings total **3,257 bytes**.
- `compose.mjs` exports `composeChicken({ breed, sex, plumage, tokenId })` and `composeEgg()`. Run `node design/svg/compose.mjs --all` to regenerate the 20 breed/sex chicken images in `out/` and `preview.html`. Run with `--preview` to refresh the page only.
- `out/` contains generated chicken SVGs, one for each of 10 breeds and 2 sexes.
- `egg/` contains the whole egg, two crack stages, aligned shell halves, and a radial hatch glow.
- `brand/` contains the 64px egg/chicken mark, favicon, and six currentColor care icons.
- `preview.html` is a static review page that embeds the composed birds, egg frames, and marks.

## Solidity renderer parity

Mirror `compose.mjs` directly from `kit.json`: validate the three numeric trait indexes, select `breeds[breed]` and `plumage[plumage]`, map each shape's `fill` slot to the selected plumage colour or `fixed` colour, and emit each part's shapes in listed order. Chicken parts paint in the breed's `parts` order; for roosters, append sex parts except `longTail`, then append `longTail` so it remains the rear-most feather. Render paths as path elements and circles/ellipses with their matching geometry and fill. Apply breed `scale` about `(200,330)` using translation `(200*(1-scale),330*(1-scale))` followed by scale. Use the same background, labels, monospace font, token ID padding, and coordinates as the module. No external assets are used by the chicken renderer.

The renderer's `d` data uses absolute integer `M`, `L`, `C`, `Q`, `H`, `V`, and `Z` commands. All colour slots are opaque hex values. A Solidity implementation can use the strings as-is and assemble the SVG with the same part iteration and ordering.
