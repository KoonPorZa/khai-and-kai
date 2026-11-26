import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAccount, useBlockNumber } from "wagmi";
import { parseEventLogs } from "viem";
import { useT } from "../i18n";
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
  const t = useT();
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
  const [missedToken, setMissedToken] = useState(false); // an errored query shows "pending" again while it refetches
  useEffect(() => {
    if (chicken.isError) setMissedToken(true);
    else if (chicken.data) setMissedToken(false);
  }, [chicken.isError, chicken.data]);
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
    if (tx.state.status === "wallet") return [t("hatch.headWalletTitle"), t("hatch.headWalletBody")] as const;
    if (tx.state.status === "pending") return [t("hatch.headPendingTitle"), t("hatch.headPendingBody")] as const;
    if (ready) return [t("hatch.headReadyTitle"), t("hatch.headReadyBody")] as const;
    return [t("hatch.headWaitTitle"), t("hatch.headWaitBody", { block: reveal !== undefined ? formatNumber(reveal) : "…" })] as const;
  }, [t, tx.state.status, ready, reveal]);

  if (id === undefined || !deployment) {
    return (
      <div className="hatch-page">
        <div className="stack narrow">
          <h1 className="h1">{t("hatch.title")}</h1>
          <p className="muted">{deployment ? t("hatch.invalid") : t("hatch.notDeployed", { network: networkLabel })}</p>
          <Link to="/coop" className="btn btn-primary">{t("hatch.backCoop")}</Link>
        </div>
      </div>
    );
  }
  if (hatchQ.isFetched && !exists) {
    return (
      <div className="hatch-page">
        <div className="stack narrow">
          <h1 className="h1">{t("hatch.titleNum", { id: String(id) })}</h1>
          <p className="muted">{t("hatch.none")}</p>
          <Link to="/coop" className="btn btn-primary">{t("hatch.backCoop")}</Link>
        </div>
      </div>
    );
  }

  if (startedFinished === undefined) {
    return (
      <div className="hatch-page">
        <p className="muted">{t("hatch.reading")}</p>
      </div>
    );
  }

  // A finished hatch is only "yours" while its bird is still with the hatch owner: after a release the token is gone,
  // and after a transfer another sponsor holds it.
  const returned = finishedToken !== undefined && revealedToken === undefined && (chicken.isError || (missedToken && !chicken.data));
  const movedOn = finishedToken !== undefined && revealedToken === undefined && !!bird && !!hatch && bird.owner.toLowerCase() !== hatch.owner.toLowerCase();
  if (returned || movedOn) {
    return (
      <div className="hatch-page">
        <div className="stack narrow">
          <h1 className="h1">{t("hatch.titleNum", { id: String(id) })}</h1>
          <p className="muted">{t(returned ? "hatch.returned" : "hatch.movedOn", { band: bandId(finishedToken!) })}</p>
          <Link to={`/chicken/${finishedToken}`} className="btn btn-primary">{t("hatch.see", { band: bandId(finishedToken!) })}</Link>
          <Link to="/eggs" className="btn btn-ghost">{t("hatch.getEgg")}</Link>
        </div>
      </div>
    );
  }

  const done = showResult && bird;
  return (
    <div className="hatch-page">
      <header className="split">
        <span className="h2">{done ? t("hatch.hatched") : t("hatch.hatching")}</span>
        <span className="mono muted small">{t("hatch.titleNum", { id: String(id) })}</span>
      </header>

      <div className="hatch-main">
        <div className="hatch-thai" lang="th" aria-hidden="true">{done ? "ไก่" : "ไข่"}</div>
        <HatchAnimation
          phase={phase}
          instant={startedFinished}
          onSettled={() => setSettled(true)}
          label={done ? t("hatch.animDone") : t("hatch.animWait")}
        >
          {bird ? (
            <div className="hatch-bird">
              <BirdThumb breed={bird.bird.breed} sex={bird.bird.sex} plumage={bird.bird.plumage} tokenId={bird.tokenId} width={200} label={speciesLabel(bird.bird.breed, bird.bird.sex)} />
              {artManifest.breeds[String(bird.bird.breed)] ? (
                <>
                  <span className="chip chip-sm">{t("hatch.breedIllustration")}</span>
                  <span className="hatch-inset">
                    <BirdGlyph breed={bird.bird.breed} sex={bird.bird.sex} plumage={bird.bird.plumage} tokenId={bird.tokenId} width={72} label={t("hatch.insetLabel", { plumage: plumageName(bird.bird.plumage).toLowerCase() })} />
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </HatchAnimation>

        {done ? (
          <div className="hatch-copy">
            <p className="accent strong">{t("hatch.sponsorOf")}</p>
            <h1 className="h1 big">{t("hatch.birdHeadline", { species: speciesLabel(bird.bird.breed, bird.bird.sex), band: bandId(bird.tokenId) })}</h1>
            <p className="muted">
              {t("hatch.birdDetail", {
                plumage: plumageName(bird.bird.plumage),
                age: ageLabel(Number(bird.bird.bornAt), now),
                duration: formatDuration(Math.max(0, Number(bird.carePaidUntil) - now)),
              })}
            </p>
            {address && !isOwner ? <p className="muted small">{t("hatch.belongsStarted", { owner: shortHex(hatch!.owner) })}</p> : null}
          </div>
        ) : (
          <div className="hatch-copy">
            <h1 className="h1 big">{heading[0]}</h1>
            <p className="muted">{heading[1]}</p>
            {address && hatch && !isOwner && !ready ? <p className="muted small">{t("hatch.belongsHatch", { owner: shortHex(hatch.owner) })}</p> : null}
          </div>
        )}
      </div>

      {done ? (
        <>
          <div className="card tight facts">
            <div><span className="muted">{t("hatch.drawnBy")}</span><span className="mono">{formatNumber(hatch!.revealBlock)}</span></div>
            <div>
              <span className="muted">{t("hatch.picked")}</span>
              <span className="mono">{proof ? t("hatch.pickedValue", { n: formatNumber(proof[2] + 1n), total: formatNumber(proof[1]) }) : "…"}</span>
            </div>
            {hatch!.usedFallback ? (
              <p className="notice small">{t("hatch.fallbackDone")}</p>
            ) : null}
          </div>
          <div className="stack tight-gap">
            <Link to={`/chicken/${bird.tokenId}`} className="btn btn-primary btn-xl">{t("hatch.meet")}</Link>
            <button type="button" className="btn btn-ghost" onClick={() => navigate("/eggs")}>{t("hatch.another")}</button>
          </div>
        </>
      ) : (
        <>
          <ol className="card tight hatch-steps">
            <li className="done"><Check /><span>{t("hatch.stepStarted")}</span><span className="mono muted small">{startBlock !== undefined ? t("hatch.blockTail", { n: String(startBlock).slice(-3) }) : ""}</span></li>
            <li className={ready ? "done" : "active"}>
              {ready ? <Check /> : <svg className="spin" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#f0b90b" strokeWidth="2" strokeDasharray="30 22" /></svg>}
              <span>{ready ? t("hatch.stepMined") : t("hatch.stepWaiting")}</span>
              <span className="mono muted small">{ready ? "" : block.data !== undefined && reveal !== undefined ? t("hatch.blockProgress", { a: formatNumber(block.data), b: formatNumber(reveal + 1n) }) : t("hatch.aboutSecond")}</span>
            </li>
            <li className={tx.busy ? "active" : "todo"}>
              {tx.busy ? <svg className="spin" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#f0b90b" strokeWidth="2" strokeDasharray="30 22" /></svg> : <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#262c36" strokeWidth="2" /></svg>}
              <span>{t("hatch.stepReveal")}</span>
            </li>
          </ol>
          {late ? (
            <p className="notice small">{t("hatch.fallbackLate")}</p>
          ) : null}
          <div className="stack tight-gap">
            <ActionButton className="btn-xl" onClick={finish} disabled={!ready || tx.busy} busy={tx.busy}>
              {tx.busy ? (tx.state.status === "wallet" ? t("hatch.btnWallet") : t("hatch.btnRevealing")) : t("hatch.btnConfirm")}
            </ActionButton>
            <p className="muted small center">{t("hatch.closedA")}<Link to="/coop">{t("hatch.closedLink")}</Link>{t("hatch.closedB")}</p>
          </div>
        </>
      )}
    </div>
  );
}
