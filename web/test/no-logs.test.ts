import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");
const FORBIDDEN = /getLogs|watchContractEvent|watchEvent|getContractEvents|getFilterLogs|eth_getLogs|createEventFilter/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("no log queries", () => {
  it("source never asks the RPC for logs (official BSC testnet RPCs reject them)", () => {
    const hits = files(SRC).filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
