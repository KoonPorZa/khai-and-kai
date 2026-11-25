import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, UserRejectedRequestError, type Hex } from "viem";
import { ageLabel, bandId, formatDuration, formatNative, parseBand, periodLabel } from "../src/lib/format";
import { friendlyError } from "../src/lib/errors";
import { MAX_NOTE_BYTES, noteBytes, recordHash } from "../src/lib/hash";
import { decodeTokenUri, isImageDataUri } from "../src/lib/chickenArt";
import { verifyHatch } from "../src/lib/verifyHatch";

describe("band ids", () => {
  it("formats and parses KK-0042", () => {
    expect(bandId(42)).toBe("KK-0042");
    expect(bandId(300n)).toBe("KK-0300");
    expect(parseBand("KK-0042")).toBe(42n);
    expect(parseBand("kk42")).toBe(42n);
    expect(parseBand(" 7 ")).toBe(7n);
    expect(parseBand("KK-0000")).toBeUndefined();
    expect(parseBand("hello")).toBeUndefined();
  });
});

describe("formatting", () => {
  it("formats durations and periods", () => {
    expect(formatDuration(42 * 60)).toBe("42 minutes");
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(2 * 3600 + 10 * 60)).toBe("2 h 10 min");
    expect(periodLabel(1, 3600)).toBe("1 period (1 hour)");
    expect(periodLabel(24, 3600)).toBe("24 periods (1 day)");
  });
  it("formats native amounts", () => {
    expect(formatNative(10_000_000_000_000_000n)).toBe("0.01");
    expect(formatNative(1_000_000_000_000_000n)).toBe("0.001");
    expect(formatNative(0n)).toBe("0");
  });
  it("labels age in months", () => {
    expect(ageLabel(0, 210 * 86400)).toBe("6 months");
  });
});

describe("error mapping", () => {
  it("maps a user rejection", () => {
    expect(friendlyError(new UserRejectedRequestError(new Error("no"))).kind).toBe("rejected");
  });
  it("maps insufficient funds text", () => {
    const e = friendlyError(new Error("insufficient funds for gas"));
    expect(e.kind).toBe("other");
  });
});

describe("care record hashing", () => {
  it("fingerprints text with keccak256 of its UTF-8 bytes", () => {
    expect(recordHash("abc")).toBe("0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  });
  it("counts note bytes, not characters", () => {
    expect(noteBytes("abc")).toBe(3);
    expect(noteBytes("ไข่")).toBe(9);
    expect(MAX_NOTE_BYTES).toBe(140);
  });
});

describe("token URI", () => {
  it("decodes the base64 JSON and accepts only image data URIs", () => {
    const json = JSON.stringify({ name: "Kai #1", image: "data:image/svg+xml;base64,PHN2Zy8+" });
    const uri = `data:application/json;base64,${btoa(json)}`;
    const meta = decodeTokenUri(uri);
    expect(meta?.name).toBe("Kai #1");
    expect(isImageDataUri(meta?.image)).toBe(true);
    expect(isImageDataUri("https://example.com/x.png")).toBe(false);
    expect(isImageDataUri("javascript:alert(1)")).toBe(false);
    expect(decodeTokenUri("ipfs://nope")).toBeUndefined();
  });
});

describe("verify the draw", () => {
  const blockHash = keccak256("0x1234") as Hex;
  const seed = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [blockHash, 7n]));
  const pool = 182n;
  const index = BigInt(seed) % pool;
  it("accepts the contract's values", () => {
    const r = verifyHatch({ hatchId: 7n, revealBlock: 100n, usedFallback: false, revealBlockHash: blockHash, poolSizeAtFinish: pool }, { seed, index });
    expect(r.ok).toBe(true);
  });
  it("rejects a different block hash", () => {
    const r = verifyHatch({ hatchId: 7n, revealBlock: 100n, usedFallback: false, revealBlockHash: keccak256("0x99"), poolSizeAtFinish: pool }, { seed, index });
    expect(r.ok).toBe(false);
  });
  it("supports the fallback draw", () => {
    const fb = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [7n, 100n]));
    const r = verifyHatch({ hatchId: 7n, revealBlock: 100n, usedFallback: true, poolSizeAtFinish: pool }, { seed: fb, index: BigInt(fb) % pool });
    expect(r.ok).toBe(true);
  });
});
