// Forbidden-string scan over a build output directory. Used by test/bundle.test.ts and by `pnpm scan:dist` (part of `deploy`),
// so a development-only wallet, key, chain or switch can never be uploaded by mistake.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FORBIDDEN = [
  "31337",
  "70997970c51812dc3a010c7d01b50e0d17dc79c8", // Hardhat #1 address
  "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Hardhat #1 private key
  "f39fd6e51aad88f6f4ce6ab8827279cfffb92266", // Hardhat #0 address
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Hardhat #0 private key
  "local test wallet",
  "local test node",
  "127.0.0.1:8545",
  "?as=local",
  "?as=farm",
  "as=farm",
  "eth_getlogs",
  /url\(\s*["']?data:[^)]*font/i, // fonts must be files so font-src can stay 'self'
];

const TEXT = /\.(js|mjs|cjs|html|css|json|svg|txt|map|webmanifest|xml)$|(^|\/)_headers$|(^|\/)_redirects$/;

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** Returns "<file>: <forbidden>" for every hit in every text file under dir. */
export function scanDir(dir) {
  const hits = [];
  for (const f of files(dir)) {
    if (!TEXT.test(f)) continue;
    const text = readFileSync(f, "utf8").toLowerCase();
    for (const bad of FORBIDDEN) {
      if (typeof bad === "string" ? text.includes(bad) : bad.test(text)) hits.push(`${f.slice(dir.length + 1)}: ${String(bad)}`);
    }
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  if (!existsSync(dir)) {
    console.error("web/dist does not exist; run the build first.");
    process.exit(1);
  }
  const hits = scanDir(dir);
  if (hits.length) {
    console.error(`Forbidden strings in web/dist:\n${hits.join("\n")}`);
    process.exit(1);
  }
  console.log(`scan:dist ok (${files(dir).length} files scanned)`);
}
