// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KindIcon } from "../src/components/Art";
import { agreeOnHash } from "../src/lib/blockHash";

afterEach(cleanup);

const A = `0x${"aa".repeat(32)}` as const;
const B = `0x${"bb".repeat(32)}` as const;

describe("reveal block hash from two RPC endpoints", () => {
  it("accepts agreement, flags one answer, and refuses disagreement", () => {
    expect(agreeOnHash([A, A])).toEqual({ status: "agreed", hash: A, sources: 2 });
    expect(agreeOnHash([A, undefined])).toEqual({ status: "agreed", hash: A, sources: 1 });
    expect(agreeOnHash([undefined, A])).toEqual({ status: "agreed", hash: A, sources: 1 });
    expect(agreeOnHash([A, B])).toEqual({ status: "disagree" });
    expect(agreeOnHash([undefined, undefined])).toEqual({ status: "none" });
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("raw SVG injection", () => {
  it("KindIcon only ever renders the bundled icon files, whatever it is given", () => {
    const bundled = new Set<string>();
    for (let k = 0; k < 6; k++) {
      const { container } = render(<KindIcon kind={k} />);
      bundled.add(container.querySelector(".kind-icon")!.innerHTML);
      cleanup();
    }
    expect(bundled.size).toBe(6);
    for (const k of [-1, 6, 99, Number.NaN, 1.5]) {
      const { container } = render(<KindIcon kind={k} />);
      const html = container.querySelector(".kind-icon")!.innerHTML.replace(/width="\d+" height="\d+"/, "");
      expect([...bundled].some((b) => b.replace(/width="\d+" height="\d+"/, "") === html)).toBe(true);
      cleanup();
    }
  });

  it("dangerouslySetInnerHTML appears once in src, fed only by the bundled icon map", () => {
    const hits = files(join(__dirname, "..", "src")).filter((f) => readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"));
    expect(hits.map((h) => h.split("/").pop())).toEqual(["Art.tsx"]);
    const art = readFileSync(hits[0]!, "utf8");
    expect(art.match(/dangerouslySetInnerHTML/g)).toHaveLength(1);
    expect(art).toContain("KIND_ICONS[kind]");
  });
});
