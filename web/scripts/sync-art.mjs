// Copies the illustrator's egg frames from design/svg/egg into src/assets/egg.
// Files that do not exist in design/ keep the placeholder already in src/assets/egg.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "..", "design", "svg", "egg");
const to = join(here, "..", "src", "assets", "egg");
const frames = ["egg", "egg-crack-1", "egg-crack-2", "shell-top", "shell-bottom", "glow"];

mkdirSync(to, { recursive: true });
let copied = 0;
for (const name of frames) {
  const src = join(from, `${name}.svg`);
  if (existsSync(src)) {
    copyFileSync(src, join(to, `${name}.svg`));
    copied += 1;
    console.log(`copied ${name}.svg`);
  } else {
    console.log(`kept placeholder ${name}.svg (not in design/svg/egg yet)`);
  }
}
console.log(`${copied} of ${frames.length} frames synced.`);
