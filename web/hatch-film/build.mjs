// Collects what the hatch film needs into hatch-film/assets: the illustrator's egg frames (as synced into
// src/assets/egg), a chicken drawn by the shared art kit, GSAP and the two display fonts. Run by `render:hatch`.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const out = join(here, "assets");
mkdirSync(out, { recursive: true });

for (const name of ["egg", "egg-crack-1", "egg-crack-2", "shell-top", "shell-bottom", "glow"]) {
  copyFileSync(join(web, "src/assets/egg", `${name}.svg`), join(out, `${name}.svg`));
}
copyFileSync(join(web, "node_modules/gsap/dist/gsap.min.js"), join(out, "gsap.min.js"));
copyFileSync(join(web, "node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff2"), join(out, "noto-thai-700.woff2"));
copyFileSync(join(web, "node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2"), join(out, "space-grotesk-700.woff2"));

const { composeChicken } = await import(pathToFileURL(join(web, "..", "design", "svg", "compose.mjs")).href);
writeFileSync(join(out, "chicken.svg"), composeChicken({ breed: 0, sex: 0, plumage: 0, tokenId: 42 }));
console.log("hatch-film assets ready");
