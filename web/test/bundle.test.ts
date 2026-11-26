import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FORBIDDEN, scanDir } from "../scripts/scan-dist.mjs";

const ROOT = join(__dirname, "..");
const out = mkdtempSync(join(tmpdir(), "kk-web-"));
let js = "";

beforeAll(() => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { cwd: ROOT, stdio: "pipe", env: { ...process.env, VITE_LOCAL: "" } });
  const dir = join(out, "assets");
  js = readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}, 170000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("production bundle", () => {
  it("contains no development-only wallet, key, chain or switch in any text file of the build output", () => {
    expect(FORBIDDEN.length).toBeGreaterThan(10);
    expect(scanDir(out)).toEqual([]);
  });

  it("the scan fires on every kind of planted string, in any text file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kk-scan-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<p>Local test node</p>");
    writeFileSync(join(dir, "assets", "a.js"), 'x="?as=farm"');
    writeFileSync(join(dir, "assets", "b.css"), "@font-face{src:url(data:font/woff2;base64,AAAA)}");
    writeFileSync(join(dir, "assets", "c.txt"), "0xAC0974BEC39A17E36BA4A6B4D238FF944BACB478CBED5EFCAE784D7BF4F2FF80");
    const hits = scanDir(dir).join("\n");
    rmSync(dir, { recursive: true, force: true });
    for (const needle of ["index.html", "a.js", "b.css", "c.txt"]) expect(hits).toContain(needle);
  });

  it("has absolute social tags from the one site address, and the HSTS header", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).toContain('property="og:url" content="https://khai-and-kai.koonporza-learn.workers.dev/"');
    expect(html).toMatch(/property="og:image" content="https:\/\/khai-and-kai\.koonporza-learn\.workers\.dev\/art\/og\./);
    expect(html).toMatch(/name="twitter:image" content="https:\/\//);
    expect(readFileSync(join(out, "_headers"), "utf8")).toContain("Strict-Transport-Security: max-age=31536000; includeSubDomains");
  });

  it("targets BNB testnet and never asks for logs", () => {
    expect(js).toContain("bsc-testnet-dataseed.bnbchain.org");
    expect(js).not.toContain("eth_getLogs");
  });

  it("refuses to build with the local flag", () => {
    expect(() =>
      execFileSync("npx", ["vite", "build", "--outDir", join(out, "never")], { cwd: ROOT, stdio: "pipe", env: { ...process.env, VITE_LOCAL: "1" } }),
    ).toThrow();
  });
});
