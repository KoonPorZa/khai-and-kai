import { useState } from "react";
import { useReadContract } from "wagmi";
import { kaiAbi } from "../abi/kai";
import { deployment, targetChain } from "../config/chains";
import { formatWhen, kindName, shortHex } from "../lib/format";

const PAGE = 5;

export function CareTimeline({ tokenId, total, now }: { tokenId: bigint; total: number; now: number }) {
  const [pages, setPages] = useState(1);
  const limit = pages * PAGE;
  const q = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "careProofs",
    args: [tokenId, 0n, BigInt(limit)],
    chainId: targetChain.id,
    query: { enabled: !!deployment && total > 0, refetchInterval: 10_000, placeholderData: (prev) => prev },
  });
  const rows = q.data ?? [];
  return (
    <section className="card stack tight-gap" aria-labelledby="record-title">
      <div className="split end">
        <h2 id="record-title" className="h2">Care record</h2>
        <span className="muted small">{total} {total === 1 ? "entry" : "entries"} from the farm</span>
      </div>
      {total === 0 ? (
        <p className="muted">The farm has not posted a record for this bird yet. Entries appear here as soon as they are confirmed.</p>
      ) : (
        <ol className="timeline">
          {rows.map((r, i) => (
            <li key={`${r.at}-${r.contentHash}-${i}`}>
              <span className="tl-dot" aria-hidden="true" />
              <span className="strong">{kindName(r.kind)}</span>
              <span className="tl-note">{r.note || "No note."}</span>
              <span className="muted small tl-when">
                {formatWhen(Number(r.at), now)} <span className="mono">record {shortHex(r.contentHash)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {rows.length < total ? (
        <button type="button" className="btn btn-ghost" onClick={() => setPages((p) => p + 1)} disabled={q.isFetching}>
          {q.isFetching ? "Loading…" : "Show more"}
        </button>
      ) : null}
    </section>
  );
}
