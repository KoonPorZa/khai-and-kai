import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAccount, useBlockNumber } from "wagmi";
import { parseEventLogs } from "viem";
import { kaiAbi } from "../abi/kai";
import { BirdGlyph, BirdThumb, Check } from "../components/Art";
import { HatchAnimation, type HatchPhase } from "../components/HatchAnimation";
import { ActionButton } from "../components/Wallet";
import { deployment, networkLabel, targetChain } from "../config/chains";
import { artManifest } from "../lib/art";
import { useChicken, useHatch } from "../hooks/useChain";
import { useChainNow } from "../hooks/useChainNow";
import { useTx } from "../hooks/useTx";
import { bandId, formatDuration, formatNumber, plumageName, shortHex, speciesLabel, ageLabel } from "../lib/format";

const FALLBACK_AFTER = 256n;

function parseId(raw: string | undefined): bigint | undefined {
  return raw && /^\d{1,12}$/.test(raw) ? BigInt(raw) : undefined;
}

export function HatchPage() {
  const id = parseId(useParams().id);
  const navigate = useNavigate();
  const fresh = (useLocation().state as { fresh?: boolean } | null)?.fresh === true;
  const { address } = useAccount();
  const now = useChainNow();
  const tx = useTx();
  const block = useBlockNumber({ chainId: targetChain.id, cacheTime: 0, query: { refetchInterval: 1000 } });
  const hatchQ = useHatch(id);
  const hatch = hatchQ.data?.[0]?.result;
  const proof = hatchQ.data?.[1]?.result;
  const [revealedToken, setRevealedToken] = useState<bigint | undefined>();
  const [settled, setSettled] = useState(false);

  const exists = !!hatch && hatch.owner !== "0x0000000000000000000000000000000000000000";
  const finishedToken = exists && hatch.birdId !== 0 ? BigInt(hatch.birdId) : undefined;
  const tokenId = revealedToken ?? finishedToken;
  const chicken = useChicken(tokenId);
  const bird = chicken.data;
  const [startedFinished, setStartedFinished] = useState<boolean | undefined>();
  useEffect(() => {
    if (startedFinished === undefined && exists) setStartedFinished(hatch.birdId !== 0);
  }, [startedFinished, exists, hatch?.birdId]);

  const reveal = hatch ? hatch.revealBlock : undefined;
  const ready = block.data !== undefined && reveal !== undefined && block.data > reveal;
  const late = block.data !== undefined && reveal !== undefined && block.data - reveal > FALLBACK_AFTER;
  const isOwner = !!address && !!hatch && address.toLowerCase() === hatch.owner.toLowerCase();

  const phase: HatchPhase = bird && tokenId !== undefined ? "burst" : tx.busy ? "crack" : "wait";
  const showResult = !!bird && (settled || startedFinished === true);

  const finish = async () => {
    if (!deployment || id === undefined) return;
    const receipt = await tx.run({ address: deployment.kai, abi: kaiAbi, functionName: "finishHatch", args: [id], padGas: true });
    if (!receipt) return;
    // finishHatch also finishes earlier pending hatches, so pick the event for this hatch.
    const done = parseEventLogs({ abi: kaiAbi, eventName: "HatchFinished", logs: receipt.logs }).find((l) => l.args.hatchId === id);
    if (done) setRevealedToken(done.args.tokenId);
    hatchQ.refetch();
  };

  // The second confirmation opens by itself once the reveal block has passed, for the hatch the user just started.
  const autoTried = useRef(false);
  const canAuto = fresh && ready && isOwner && finishedToken === undefined && !!deployment;
  useEffect(() => {
    if (!canAuto || autoTried.current) return;
    autoTried.current = true;
    void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAuto]);

  const startBlock = reveal !== undefined ? reveal - 2n : undefined;
  const heading = useMemo(() => {
    if (tx.state.status === "wallet") return ["Confirm in your wallet", "Approve the reveal to find out which bird is yours."] as const;
    if (tx.state.status === "pending") return ["The shell is cracking", "Waiting for the network to confirm the draw."] as const;
    if (ready) return ["Your egg is ready", "Confirm the reveal in your wallet to see which bird is yours."] as const;
    return ["Something is moving in there", `Waiting for block ${reveal !== undefined ? formatNumber(reveal) : "…"}. Its hash decides which bird is yours.`] as const;
  }, [tx.state.status, ready, reveal]);

  if (id === undefined || !deployment) {
    return (
      <div className="hatch-page">
        <div className="stack narrow">
          <h1 className="h1">Hatch</h1>
          <p className="muted">{deployment ? "That hatch number is not valid." : `Contracts are not deployed on ${networkLabel} yet.`}</p>
          <Link to="/coop" className="btn btn-primary">Back to My coop</Link>
        </div>
      </div>
    );
  }
  if (hatchQ.isFetched && !exists) {
    return (
      <div className="hatch-page">
        <div className="stack narrow">
          <h1 className="h1">Hatch #{String(id)}</h1>
          <p className="muted">There is no hatch with this number.</p>
          <Link to="/coop" className="btn btn-primary">Back to My coop</Link>
        </div>
      </div>
    );
  }

  if (startedFinished === undefined) {
    return (
      <div className="hatch-page">
        <p className="muted">Reading the hatch from the chain…</p>
      </div>
    );
  }

  const done = showResult && bird;
  return (
    <div className="hatch-page">
      <header className="split">
        <span className="h2">{done ? "Hatched" : "Hatching"}</span>
        <span className="mono muted small">Hatch #{String(id)}</span>
      </header>

      <div className="hatch-main">
        <div className="hatch-thai" lang="th" aria-hidden="true">{done ? "ไก่" : "ไข่"}</div>
        <HatchAnimation
          phase={phase}
          instant={startedFinished}
          onSettled={() => setSettled(true)}
          label={done ? "Your chicken has hatched" : "An egg about to hatch"}
        >
          {bird ? (
            <div className="hatch-bird">
              <BirdThumb breed={bird.bird.breed} sex={bird.bird.sex} plumage={bird.bird.plumage} tokenId={bird.tokenId} width={200} label={speciesLabel(bird.bird.breed, bird.bird.sex)} />
              {artManifest.breeds[String(bird.bird.breed)] ? (
                <>
                  <span className="chip chip-sm">Breed illustration</span>
                  <span className="hatch-inset">
                    <BirdGlyph breed={bird.bird.breed} sex={bird.bird.sex} plumage={bird.bird.plumage} tokenId={bird.tokenId} width={72} label={`This bird's own art: ${plumageName(bird.bird.plumage).toLowerCase()} plumage`} />
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </HatchAnimation>

        {done ? (
          <div className="hatch-copy">
            <p className="accent strong">You are now the sponsor of</p>
            <h1 className="h1 big">{speciesLabel(bird.bird.breed, bird.bird.sex)}, band {bandId(bird.tokenId)}</h1>
            <p className="muted">
              {plumageName(bird.bird.plumage)} plumage, {ageLabel(Number(bird.bird.bornAt), now)} old. Care is paid for the next{" "}
              {formatDuration(Math.max(0, Number(bird.carePaidUntil) - now))}.
            </p>
            {address && !isOwner ? <p className="muted small">This bird belongs to {shortHex(hatch!.owner)}, who started the hatch.</p> : null}
          </div>
        ) : (
          <div className="hatch-copy">
            <h1 className="h1 big">{heading[0]}</h1>
            <p className="muted">{heading[1]}</p>
            {address && hatch && !isOwner && !ready ? <p className="muted small">This hatch belongs to {shortHex(hatch.owner)}.</p> : null}
          </div>
        )}
      </div>

      {done ? (
        <>
          <div className="card tight facts">
            <div><span className="muted">Drawn by block</span><span className="mono">{formatNumber(hatch!.revealBlock)}</span></div>
            <div>
              <span className="muted">Picked</span>
              <span className="mono">{proof ? `bird ${formatNumber(proof[2] + 1n)} of ${formatNumber(proof[1])} waiting` : "…"}</span>
            </div>
            {hatch!.usedFallback ? (
              <p className="notice small">Fallback draw: the block hash was more than 256 blocks old, so the draw used the hatch number and block number instead.</p>
            ) : null}
          </div>
          <div className="stack tight-gap">
            <Link to={`/chicken/${bird.tokenId}`} className="btn btn-primary btn-xl">Meet your chicken</Link>
            <button type="button" className="btn btn-ghost" onClick={() => navigate("/eggs")}>Hatch another egg</button>
          </div>
        </>
      ) : (
        <>
          <ol className="card tight hatch-steps">
            <li className="done"><Check /><span>Hatch started</span><span className="mono muted small">{startBlock !== undefined ? `block …${String(startBlock).slice(-3)}` : ""}</span></li>
            <li className={ready ? "done" : "active"}>
              {ready ? <Check /> : <svg className="spin" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#f0b90b" strokeWidth="2" strokeDasharray="30 22" /></svg>}
              <span>{ready ? "Reveal block mined" : "Waiting 2 blocks"}</span>
              <span className="mono muted small">{ready ? "" : block.data !== undefined && reveal !== undefined ? `block ${formatNumber(block.data)} of ${formatNumber(reveal + 1n)}` : "about 1 second"}</span>
            </li>
            <li className={tx.busy ? "active" : "todo"}>
              {tx.busy ? <svg className="spin" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#f0b90b" strokeWidth="2" strokeDasharray="30 22" /></svg> : <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#262c36" strokeWidth="2" /></svg>}
              <span>Reveal your bird</span>
            </li>
          </ol>
          {late ? (
            <p className="notice small">
              More than 256 blocks have passed, so this hatch will use the fallback draw (hatch number and block number instead of the block hash). It still finishes and is labelled on the chicken's page.
            </p>
          ) : null}
          <div className="stack tight-gap">
            <ActionButton className="btn-xl" onClick={finish} disabled={!ready || tx.busy} busy={tx.busy}>
              {tx.busy ? (tx.state.status === "wallet" ? "Confirm in your wallet…" : "Revealing…") : "Confirm reveal in wallet"}
            </ActionButton>
            <p className="muted small center">Closed the tab? Your hatch waits in <Link to="/coop">My coop</Link>. Anyone can finish it.</p>
          </div>
        </>
      )}
    </div>
  );
}
