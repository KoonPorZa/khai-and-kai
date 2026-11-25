import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  it("contains no local chain, test wallet or Hardhat key", () => {
    expect(js).not.toContain("31337");
    expect(js.toLowerCase()).not.toContain("70997970c51812dc3a010c7d01b50e0d17dc79c8");
    expect(js.toLowerCase()).not.toContain("59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    expect(js).not.toContain("Local test wallet");
    expect(js).not.toContain("127.0.0.1:8545");
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
