import type { Hex } from "viem";

/** One block hash from one JSON-RPC endpoint, or undefined when it cannot answer (plain fetch: no log queries involved). */
export async function fetchBlockHash(url: string, blockNumber: bigint, timeoutMs = 8000): Promise<Hex | undefined> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: [`0x${blockNumber.toString(16)}`, false] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json()) as { result?: { hash?: unknown } | null };
    const hash = json.result?.hash;
    return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash) ? (hash as Hex) : undefined;
  } catch {
    return undefined;
  }
}

export type HashAgreement =
  | { status: "agreed"; hash: Hex; sources: 1 | 2 }
  | { status: "disagree" }
  | { status: "none" };

/** Two endpoints must give the same hash; if only one answers the caller says "checked against one RPC". */
export function agreeOnHash(answers: (Hex | undefined)[]): HashAgreement {
  const got = answers.filter((h): h is Hex => !!h);
  const first = got[0];
  if (!first) return { status: "none" };
  if (got.some((h) => h.toLowerCase() !== first.toLowerCase())) return { status: "disagree" };
  return { status: "agreed", hash: first, sources: got.length >= 2 ? 2 : 1 };
}
