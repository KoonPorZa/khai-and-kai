import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { composeChicken } from "../src/lib/composeArt";

describe("art kit port", () => {
  it("draws every breed and sex exactly like design/svg/compose.mjs", async () => {
    const file = pathToFileURL(join(__dirname, "..", "..", "design", "svg", "compose.mjs")).href;
    const original = (await import(/* @vite-ignore */ file)) as { composeChicken: (o: object) => string };
    let n = 0;
    for (let breed = 0; breed < 10; breed++) {
      for (let sex = 0; sex < 2; sex++) {
        for (const plumage of [0, (breed + 3) % 8, 7]) {
          const o = { breed, sex, plumage, tokenId: 1 + breed * 7 + sex };
          expect(composeChicken(o)).toBe(original.composeChicken(o));
          n += 1;
        }
      }
    }
    expect(n).toBe(60);
  });

  it("rejects traits outside the kit", () => {
    expect(() => composeChicken({ breed: 10 })).toThrow(RangeError);
    expect(() => composeChicken({ sex: 2 })).toThrow(RangeError);
  });
});
