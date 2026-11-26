// Copies the illustrator's art from design/ into web/. Safe to re-run: files missing in design/ are skipped,
// and src/art/manifest.json is rebuilt from what is present in web/public/art afterwards.
//
//   design/svg/egg, design/svg/brand, design/svg/kit.json  ->  src/assets/egg, src/assets/brand, src/art/kit.json, public/favicon.svg
//   design/art/{hero,og,empty-coop}.{webp,png}               ->  public/art/
//   design/art/breeds/<id>-<name>.{webp,png}                 ->  public/art/breeds/
//
// A PNG with no WebP twin is converted with ffmpeg when ffmpeg is on the PATH, otherwise the PNG is copied.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const design = join(web, "..", "design");

const copy = (from, to) => {
  if (!existsSync(from)) return false;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  return true;
};

let copied = 0;
const note = (ok, label) => {
  if (ok) copied += 1;
  else console.log(`skipped ${label} (not in design/ yet)`);
};

for (const name of ["egg", "egg-crack-1", "egg-crack-2", "shell-top", "shell-bottom", "glow"]) {
  note(copy(join(design, "svg/egg", `${name}.svg`), join(web, "src/assets/egg", `${name}.svg`)), `egg/${name}.svg`);
}
for (const name of ["logo-mark", "feeding", "health", "weight", "vaccination", "photo", "note"]) {
  note(copy(join(design, "svg/brand", `${name}.svg`), join(web, "src/assets/brand", `${name}.svg`)), `brand/${name}.svg`);
}
note(copy(join(design, "svg/brand/favicon.svg"), join(web, "public/favicon.svg")), "brand/favicon.svg");
note(copy(join(design, "svg/kit.json"), join(web, "src/art/kit.json")), "kit.json");

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Copies one raster image into public/art, preferring WebP. Returns the public file name, or undefined. */
function syncRaster(dir, base, outDir) {
  const webp = join(dir, `${base}.webp`);
  const png = join(dir, `${base}.png`);
  mkdirSync(outDir, { recursive: true });
  if (existsSync(webp)) {
    copyFileSync(webp, join(outDir, `${base}.webp`));
    return `${base}.webp`;
  }
  if (existsSync(png)) {
    const out = join(outDir, `${base}.webp`);
    if (hasFfmpeg) {
      try {
        if (!existsSync(out) || statSync(out).mtimeMs < statSync(png).mtimeMs) {
          execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-c:v", "libwebp", "-quality", "82", out]);
        }
        return `${base}.webp`;
      } catch {
        // fall through to the PNG copy
      }
    }
    copyFileSync(png, join(outDir, `${base}.png`));
    return `${base}.png`;
  }
  return undefined;
}

const manifest = { hero: null, og: null, emptyCoop: null, breeds: {} };
const artDir = join(design, "art");
const publicArt = join(web, "public/art");

for (const [key, base] of [["hero", "hero"], ["og", "og"], ["emptyCoop", "empty-coop"]]) {
  const file = syncRaster(artDir, base, publicArt);
  if (file) {
    manifest[key] = `/art/${file}`;
    copied += 1;
  } else console.log(`skipped ${base} (not in design/art yet)`);
}

const breedsDir = join(artDir, "breeds");
if (existsSync(breedsDir)) {
  const bases = new Set(readdirSync(breedsDir).filter((f) => /\.(png|webp)$/.test(f)).map((f) => parse(f).name));
  for (const base of bases) {
    const id = /^(\d+)-/.exec(base)?.[1];
    if (id === undefined) continue;
    const file = syncRaster(breedsDir, base, join(publicArt, "breeds"));
    if (file) {
      manifest.breeds[String(Number(id))] = `/art/breeds/${file}`;
      copied += 1;
    }
  }
}
if (Object.keys(manifest.breeds).length === 0) console.log("skipped breeds/ (no portraits in design/art/breeds yet)");

writeFileSync(join(web, "src/art/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${copied} files synced. manifest: hero=${manifest.hero ?? "-"} og=${manifest.og ?? "-"} breeds=${Object.keys(manifest.breeds).length}`);
