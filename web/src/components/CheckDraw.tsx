import { useState } from "react";
import { useBlock } from "wagmi";
import { Check, Warn } from "./Art";
import { CHECK_RPCS, targetChain } from "../config/chains";
import { agreeOnHash, fetchBlockHash } from "../lib/blockHash";
import { formatNumber, shortHex } from "../lib/format";
import { verifyHatch } from "../lib/verifyHatch";
import type { Hex } from "viem";

type Props = {
  hatchId: bigint;
  revealBlock: bigint;
  usedFallback: boolean;
  seed: Hex;
  poolSizeAtFinish: bigint;
  index: bigint;
};

type Result =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; position: bigint; sources: 1 | 2 }
  | { status: "bad" }
  | { status: "error"; message: string };

export function CheckDraw({ hatchId, revealBlock, usedFallback, seed, poolSizeAtFinish, index }: Props) {
  const [result, setResult] = useState<Result>({ status: "idle" });
  const block = useBlock({ blockNumber: revealBlock, chainId: targetChain.id, query: { staleTime: Infinity } });
  const hash = block.data?.hash ?? undefined;

  const check = async () => {
    setResult({ status: "running" });
    try {
      let revealBlockHash: Hex | undefined;
      let sources: 1 | 2 = 2;
      if (!usedFallback) {
        // The block hash comes straight from two different RPC endpoints and they have to agree.
        const agreed = agreeOnHash(await Promise.all(CHECK_RPCS.map((url) => fetchBlockHash(url, revealBlock))));
        if (agreed.status === "disagree") throw new Error("Two RPC endpoints returned different hashes for the reveal block. Try again later.");
        if (agreed.status === "none") throw new Error("No RPC endpoint returned the reveal block hash.");
        revealBlockHash = agreed.hash;
        sources = agreed.sources;
      }
      const r = verifyHatch({ hatchId, revealBlock, usedFallback, revealBlockHash, poolSizeAtFinish }, { seed, index });
      setResult(r.ok ? { status: "ok", position: r.index + 1n, sources } : { status: "bad" });
    } catch (e) {
      setResult({ status: "error", message: e instanceof Error ? e.message : "Could not load the block." });
    }
  };

  return (
    <section className="card stack tight-gap" aria-labelledby="drawn-title">
      <h2 id="drawn-title" className="h2">How this bird was drawn</h2>
      <dl className="kv">
        <div><dt>Hatch</dt><dd>#{String(hatchId)}</dd></div>
        <div><dt>Reveal block</dt><dd>{formatNumber(revealBlock)}</dd></div>
        <div><dt>Block hash</dt><dd>{usedFallback ? "too old, fallback draw" : hash ? shortHex(hash) : "…"}</dd></div>
        <div><dt>Birds waiting then</dt><dd>{formatNumber(poolSizeAtFinish)}</dd></div>
        <div><dt>Position picked</dt><dd>{formatNumber(index + 1n)}</dd></div>
      </dl>
      <p className="muted small">
        Only the reveal block hash is cross-checked on two RPC endpoints. The hatch record and the stored seed are read from the RPC this page already uses.
      </p>
      {usedFallback ? (
        <p className="notice small">
          Fallback draw. The reveal block hash was more than 256 blocks old when this hatch finished, so the contract used the hatch number and block number instead.
        </p>
      ) : null}
      <div className="row">
        <button type="button" className="btn btn-outline" onClick={check} disabled={result.status === "running"}>
          {result.status === "running" ? "Checking…" : result.status === "bad" || result.status === "error" ? "Check again" : "Check the draw"}
        </button>
      </div>
      <div className="check-result" role="status">
        {result.status === "ok" ? (
          <div className="stack tight-gap">
            <p className="row nowrap ok-text">
              <Check size={18} />
              <span>
                Checked in your browser: the {usedFallback ? "seed" : "seed and pool position"} recomputed from the {usedFallback ? "hatch number and block number" : "block hash and hatch number"} match what the contract stored (position {formatNumber(result.position)} of {formatNumber(poolSizeAtFinish)}).
                {usedFallback ? " The seed came from the hatch number because the block hash had expired." : result.sources === 1 ? " Checked against one RPC." : " Two RPC endpoints gave the same block hash."}
              </span>
            </p>
            <p className="muted small">Limit: whoever finished the hatch could see the block hash before sending the transaction. Which bird sat at that position is contract state at that block.</p>
          </div>
        ) : null}
        {result.status === "bad" ? <p className="row nowrap bad-text"><Warn size={18} /><span>The recomputed draw does not match what this page read from the contract. A faulty or out-of-date RPC can cause that too, so use Check again before drawing conclusions.</span></p> : null}
        {result.status === "error" ? <p className="row nowrap bad-text"><Warn size={18} /><span>{result.message} A faulty RPC can cause this; Check again to retry.</span></p> : null}
      </div>
    </section>
  );
}
