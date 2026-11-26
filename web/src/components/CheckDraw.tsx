import { useState } from "react";
import { useBlock, useConfig } from "wagmi";
import { getBlock } from "wagmi/actions";
import { Check, Warn } from "./Art";
import { targetChain } from "../config/chains";
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

type Result = { status: "idle" } | { status: "running" } | { status: "ok"; position: bigint } | { status: "bad" } | { status: "error"; message: string };

export function CheckDraw({ hatchId, revealBlock, usedFallback, seed, poolSizeAtFinish, index }: Props) {
  const config = useConfig();
  const [result, setResult] = useState<Result>({ status: "idle" });
  const block = useBlock({ blockNumber: revealBlock, chainId: targetChain.id, query: { staleTime: Infinity } });
  const hash = block.data?.hash ?? undefined;

  const check = async () => {
    setResult({ status: "running" });
    try {
      let revealBlockHash: Hex | undefined;
      if (!usedFallback) {
        const b = await getBlock(config, { blockNumber: revealBlock, chainId: targetChain.id });
        revealBlockHash = b.hash ?? undefined;
        if (!revealBlockHash) throw new Error("The RPC did not return the block hash.");
      }
      const r = verifyHatch({ hatchId, revealBlock, usedFallback, revealBlockHash, poolSizeAtFinish }, { seed, index });
      setResult(r.ok ? { status: "ok", position: r.index + 1n } : { status: "bad" });
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
      {usedFallback ? (
        <p className="notice small">
          Fallback draw. The reveal block hash was more than 256 blocks old when this hatch finished, so the contract used the hatch number and block number instead.
        </p>
      ) : null}
      <div className="row">
        <button type="button" className="btn btn-outline" onClick={check} disabled={result.status === "running"}>
          {result.status === "running" ? "Checking…" : "Check the draw"}
        </button>
      </div>
      <div className="check-result" role="status">
        {result.status === "ok" ? (
          <p className="row nowrap ok-text"><Check size={18} /><span>Checked in your browser. {usedFallback ? "The hatch number and block number" : "The block hash and hatch number"} give position {formatNumber(result.position)} of {formatNumber(poolSizeAtFinish)}, the same as the contract recorded. That proves the position was not chosen by anyone. Which bird sat at that position is contract state at that block.</span></p>
        ) : null}
        {result.status === "bad" ? <p className="row nowrap bad-text"><Warn size={18} /><span>The recomputed draw does not match the contract. Do not trust this record.</span></p> : null}
        {result.status === "error" ? <p className="row nowrap bad-text"><Warn size={18} /><span>{result.message}</span></p> : null}
      </div>
    </section>
  );
}
