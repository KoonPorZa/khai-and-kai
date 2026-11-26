import { useState } from "react";
import { useBlock } from "wagmi";
import { Check, Warn } from "./Art";
import { CHECK_RPCS, targetChain } from "../config/chains";
import { agreeOnHash, fetchBlockHash } from "../lib/blockHash";
import { useT } from "../i18n";
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
  const t = useT();
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
        if (agreed.status === "disagree") throw new Error(t('chicken.drawErrDisagree'));
        if (agreed.status === "none") throw new Error(t('chicken.drawErrNone'));
        revealBlockHash = agreed.hash;
        sources = agreed.sources;
      }
      const r = verifyHatch({ hatchId, revealBlock, usedFallback, revealBlockHash, poolSizeAtFinish }, { seed, index });
      setResult(r.ok ? { status: "ok", position: r.index + 1n, sources } : { status: "bad" });
    } catch (e) {
      setResult({ status: "error", message: e instanceof Error ? e.message : t('chicken.drawErrLoad') });
    }
  };

  return (
    <section className="card stack tight-gap" aria-labelledby="drawn-title">
      <h2 id="drawn-title" className="h2">{t('chicken.drawTitle')}</h2>
      <dl className="kv">
        <div><dt>{t('chicken.drawHatch')}</dt><dd>#{String(hatchId)}</dd></div>
        <div><dt>{t('chicken.drawRevealBlock')}</dt><dd>{formatNumber(revealBlock)}</dd></div>
        <div><dt>{t('chicken.drawBlockHash')}</dt><dd>{usedFallback ? t('chicken.drawTooOld') : hash ? shortHex(hash) : "…"}</dd></div>
        <div><dt>{t('chicken.drawWaiting')}</dt><dd>{formatNumber(poolSizeAtFinish)}</dd></div>
        <div><dt>{t('chicken.drawPosition')}</dt><dd>{formatNumber(index + 1n)}</dd></div>
      </dl>
      <p className="muted small">{t('chicken.drawScope')}</p>
      {usedFallback ? (
        <p className="notice small">{t('chicken.drawFallback')}</p>
      ) : null}
      <div className="row">
        <button type="button" className="btn btn-outline" onClick={check} disabled={result.status === "running"}>
          {result.status === "running" ? t('chicken.drawChecking') : result.status === "bad" || result.status === "error" ? t('chicken.drawAgain') : t('chicken.drawCheck')}
        </button>
      </div>
      <div className="check-result" role="status">
        {result.status === "ok" ? (
          <div className="stack tight-gap">
            <p className="row nowrap ok-text">
              <Check size={18} />
              <span>
                {t(usedFallback ? 'chicken.drawOkFallback' : 'chicken.drawOkFull', { pos: formatNumber(result.position), total: formatNumber(poolSizeAtFinish) })}
                {usedFallback ? t('chicken.drawOkExpired') : result.sources === 1 ? t('chicken.drawOkOne') : t('chicken.drawOkTwo')}
              </span>
            </p>
            <p className="muted small">{t('chicken.drawLimit')}</p>
          </div>
        ) : null}
        {result.status === "bad" ? <p className="row nowrap bad-text"><Warn size={18} /><span>{t('chicken.drawBad')}</span></p> : null}
        {result.status === "error" ? <p className="row nowrap bad-text"><Warn size={18} /><span>{t('chicken.drawErrorTail', { message: result.message })}</span></p> : null}
      </div>
    </section>
  );
}
