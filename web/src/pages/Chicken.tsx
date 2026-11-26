import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount, useBlock, useReadContract } from "wagmi";
import { kaiAbi } from "../abi/kai";
import { BirdGlyph, BreedPortrait, Check, Lock, Warn } from "../components/Art";
import { CareTimeline } from "../components/CareTimeline";
import { CheckDraw } from "../components/CheckDraw";
import { ActionButton } from "../components/Wallet";
import { useToast } from "../components/Toast";
import { deployment, EXPLORER, nativeSymbol, networkLabel, targetChain } from "../config/chains";
import { useBird, useCareParams, useChicken, useHatch } from "../hooks/useChain";
import { useChainNow } from "../hooks/useChainNow";
import { useTx } from "../hooks/useTx";
import { decodeTokenUri, isImageDataUri } from "../lib/chickenArt";
import { ageLabel, bandId, clockTime, formatDate, formatWhen, formatDuration, formatNative, periodLabel, plumageName, sexName, shortHex, speciesLabel } from "../lib/format";

const PERIOD_CHOICES = [1, 3, 24];

export function ChickenPage() {
  const raw = useParams().id;
  const id = raw && /^\d{1,9}$/.test(raw) ? BigInt(raw) : undefined;
  const { address } = useAccount();
  const now = useChainNow();
  const toast = useToast();
  const tx = useTx();
  const { careFee, carePeriod, maxPeriods } = useCareParams();
  const chicken = useChicken(id);
  const waiting = useBird(chicken.isError ? id : undefined);
  const c = chicken.data;
  const hatchQ = useHatch(c && c.hatchId > 0n ? c.hatchId : undefined);
  const hatch = hatchQ.data?.[0]?.result;
  const proof = hatchQ.data?.[1]?.result;
  const hatchBlock = useBlock({
    blockNumber: hatch?.revealBlock,
    chainId: targetChain.id,
    query: { enabled: !!hatch, staleTime: Infinity },
  });
  const uri = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "tokenURI",
    args: [id ?? 0n],
    chainId: targetChain.id,
    query: { enabled: !!deployment && !!c, staleTime: 30_000 },
  });
  const tokenArt = useMemo(() => {
    const meta = uri.data ? decodeTokenUri(uri.data) : undefined;
    return isImageDataUri(meta?.image) ? meta.image : undefined;
  }, [uri.data]);
  const releasable = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "releasableAt",
    args: [id ?? 0n],
    chainId: targetChain.id,
    query: { enabled: !!deployment && !!c, refetchInterval: 10_000 },
  });
  const requestTx = useTx();
  const cancelTx = useTx();
  const [periods, setPeriods] = useState(1);

  if (id === undefined || id === 0n) {
    return (
      <div className="stack narrow">
        <h1 className="h1">Chicken not found</h1>
        <p className="muted">That band number is not valid.</p>
        <Link to="/coop" className="btn btn-primary">Back to My coop</Link>
      </div>
    );
  }
  if (!deployment) {
    return (
      <div className="stack narrow">
        <h1 className="h1">{bandId(id)}</h1>
        <p className="muted">Contracts are not deployed on {networkLabel} yet, so there is nothing to read.</p>
      </div>
    );
  }
  if (chicken.isError) {
    if (waiting.isLoading) {
      return (
        <div className="stack narrow">
          <BackLink />
          <p className="muted">Reading {bandId(id)} from the chain…</p>
        </div>
      );
    }
    if (!waiting.bird) {
      return (
        <div className="stack narrow">
          <BackLink />
          <h1 className="h1">Chicken not found</h1>
          <p className="muted">No bird is registered with the band {bandId(id)}.</p>
          <Link to="/" className="btn btn-primary">Back to the home page</Link>
        </div>
      );
    }
    return <WaitingBird id={id} bird={waiting.bird} now={now} />;
  }
  if (!c) {
    return (
      <div className="stack narrow">
        <BackLink />
        <p className="muted">Reading {bandId(id)} from the chain…</p>
      </div>
    );
  }

  const redeemed = c.redeemedAt > 0n;
  const requested = c.redeemRequestedAt > 0n;
  const left = Number(c.carePaidUntil) - now;
  const overdue = !redeemed && left < 0;
  const period = Number(carePeriod ?? 0n) > 0 ? Number(carePeriod) : 3600; // never divide by a zero period
  // Share of the current period that has passed; with several periods paid ahead it counts within the one running now.
  const progress = overdue ? 100 : Math.round((1 - (left % period || period) / period) * 100);
  const mine = !!address && address.toLowerCase() === c.owner.toLowerCase();
  const releaseAt = releasable.data !== undefined ? Number(releasable.data) : 0;
  const canRelease = !redeemed && overdue && releaseAt > 0 && now > releaseAt;
  const name = speciesLabel(c.bird.breed, c.bird.sex);
  const cap = Number(maxPeriods ?? 8760n);
  const choices = PERIOD_CHOICES.filter((p) => p <= cap);
  const n = Math.min(periods, cap);
  const total = careFee !== undefined ? careFee * BigInt(n) : undefined;

  const pay = async () => {
    if (total === undefined) return;
    const receipt = await tx.run({ address: deployment!.kai, abi: kaiAbi, functionName: "payCare", args: [id, BigInt(n)], value: total });
    if (!receipt) return;
    toast("ok", `Care paid for ${bandId(id)}.`, `Covered for ${formatDuration(n * period)} more.`);
    chicken.refetch();
  };

  const request = async () => {
    const receipt = await requestTx.run({ address: deployment!.kai, abi: kaiAbi, functionName: "requestRedeem", args: [id] });
    if (!receipt) return;
    toast("ok", `Collection requested for ${bandId(id)}.`, "The farm will hand the bird over and confirm it here.");
    chicken.refetch();
  };
  const cancel = async () => {
    const receipt = await cancelTx.run({ address: deployment!.kai, abi: kaiAbi, functionName: "cancelRedeem", args: [id] });
    if (!receipt) return;
    toast("info", "Collection request cancelled.");
    chicken.refetch();
  };

  const payButton = (
    <ActionButton variant={overdue ? "coral" : "primary"} className="btn-block" onClick={pay} disabled={total === undefined} busy={tx.busy}>
      {tx.state.status === "wallet" ? "Confirm in your wallet…" : tx.state.status === "pending" ? "Paying…" : overdue && n === 1 && total !== undefined ? `Pay 1 period, ${formatNative(total)} ${nativeSymbol}` : "Pay care"}
    </ActionButton>
  );

  return (
    <div className="stack">
      <BackLink />
      <div className="cols">
        <div className="stack">
          <div className="portrait">
            <span className="portrait-thai" lang="th" aria-hidden="true">ไก่</span>
            <BreedPortrait breed={c.bird.breed} sex={c.bird.sex} plumage={c.bird.plumage} tokenId={c.tokenId} />
            <span className="chip">Breed illustration</span>
          </div>

          <div className="stack tight-gap">
            <div className="split start">
              <h1 className="h1">{name}</h1>
              <span className="band mono">{bandId(c.tokenId)}</span>
            </div>
            <p className="muted">
              {mine ? "Sponsored by you" : `Sponsored by ${shortHex(c.owner)}`}
              {hatchBlock.data ? `. Hatched ${formatDate(Number(hatchBlock.data.timestamp))}` : ""}. Sample bird on testnet.
            </p>
            <dl className="traits">
              <div><dt>Plumage</dt><dd>{plumageName(c.bird.plumage)}</dd></div>
              <div><dt>Age</dt><dd>{ageLabel(Number(c.bird.bornAt), now)}</dd></div>
              <div><dt>Token</dt><dd>Kai #{String(c.tokenId)}</dd></div>
            </dl>
          </div>

          {hatch && proof && hatch.birdId !== 0 ? (
            <CheckDraw hatchId={c.hatchId} revealBlock={hatch.revealBlock} usedFallback={hatch.usedFallback} seed={proof[0]} poolSizeAtFinish={proof[1]} index={proof[2]} />
          ) : null}
        </div>

        <div className="stack">
          {redeemed ? (
            <section className="card care care-ok collected" aria-labelledby="collected-title">
              <div className="row nowrap">
                <Check size={24} />
                <div>
                  <h2 id="collected-title" className="strong">Collected on {formatDate(Number(c.redeemedAt))}</h2>
                  <div className="muted small">This token is now the bird's permanent record. There is no care fee any more, and it can be transferred freely.</div>
                </div>
              </div>
            </section>
          ) : (
            <>
          <section className={`card care ${overdue ? "care-bad" : "care-ok"}`} aria-labelledby="care-title">
            <div className="row nowrap">
              {overdue ? <Warn /> : <Check size={24} />}
              <div>
                <h2 id="care-title" className="strong">{overdue ? `Care is ${formatDuration(-left)} overdue` : "Care is paid"}</h2>
                <div className="muted small">
                  {overdue
                    ? "The farm keeps feeding this bird, but the fee that pays for it has run out."
                    : `${formatDuration(left)} left, until ${clockTime(Number(c.carePaidUntil))}`}
                </div>
              </div>
            </div>
            {overdue ? (
              <div className="row nowrap lock-row"><Lock /><span>Transfers are locked until care is paid.</span></div>
            ) : (
              <div className="progress" role="img" aria-label={`${progress} percent of the current care period has passed`}>
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="row nowrap">
              <label htmlFor="periods" className="muted small">{overdue ? "Pay for" : "Add"}</label>
              <select id="periods" value={n} onChange={(e) => setPeriods(Number(e.target.value))}>
                {choices.map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p, period)}{careFee !== undefined ? `, ${formatNative(careFee * BigInt(p))} ${nativeSymbol}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {payButton}
            <p className="muted small">
              {overdue
                ? "Paying now covers the next period from this moment. Anyone can pay for any chicken."
                : "Goes to the farm. If care runs out, this chicken can't be transferred until it is paid again."}
            </p>
          </section>


            {overdue && releaseAt > 0 ? (
              <p className={`notice small ${canRelease ? "notice-bad" : ""}`} role="status">
                {canRelease
                  ? "This bird can now be returned to the coop. Pay care to keep it."
                  : `The farm may return this bird to the coop after ${formatWhen(releaseAt, now)}. Paying care before then keeps it yours.`}
              </p>
            ) : null}

            {requested ? (
              <section className="card stack tight-gap collect-pending" aria-labelledby="collect-title">
                <h2 id="collect-title" className="strong">Collection requested on {formatDate(Number(c.redeemRequestedAt))}</h2>
                <p className="muted small">Waiting for the farm to hand over the bird. The token cannot be transferred meanwhile, and care still runs.</p>
                {mine ? (
                  <ActionButton variant="outline" className="btn-block" onClick={cancel} busy={cancelTx.busy}>
                    {cancelTx.state.status === "wallet" ? "Confirm in your wallet…" : cancelTx.state.status === "pending" ? "Cancelling…" : "Cancel request"}
                  </ActionButton>
                ) : null}
              </section>
            ) : mine && !overdue ? (
              <section className="card stack tight-gap" aria-labelledby="collect-title">
                <h2 id="collect-title" className="strong">Collect this bird</h2>
                <p className="muted small">
                  The farm hands over the real bird. The token stays with you as the bird's record, and care fees stop. You can cancel until the farm confirms.
                </p>
                <ActionButton variant="outline" className="btn-block" onClick={request} busy={requestTx.busy}>
                  {requestTx.state.status === "wallet" ? "Confirm in your wallet…" : requestTx.state.status === "pending" ? "Requesting…" : "Collect this bird"}
                </ActionButton>
              </section>
            ) : null}
            </>
          )}

          <CareTimeline tokenId={c.tokenId} total={Number(c.proofCount)} now={now} />

          <section className="card row nowrap onchain">
            <div className="onchain-art">
              {tokenArt ? <img src={tokenArt} alt="On-chain token art" /> : <BirdGlyph breed={c.bird.breed} sex={c.bird.sex} plumage={c.bird.plumage} tokenId={c.tokenId} width={84} label="On-chain token art" />}
            </div>
            <div className="stack tight-gap">
              <div className="strong">On-chain token art</div>
              <div className="muted small">Drawn by the contract from this bird's traits. It is what wallets and explorers show.</div>
              {targetChain.id === 97 ? (
                <a href={`${EXPLORER}/token/${deployment.kai}?a=${c.tokenId}`} target="_blank" rel="noreferrer">View token on BscScan</a>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/coop" className="back">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M11 3 L5 9 L11 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      My coop
    </Link>
  );
}

/** A registered bird that nobody has hatched yet: its traits, its art, and the way to sponsor one. */
function WaitingBird({ id, bird, now }: { id: bigint; bird: { breed: number; sex: number; plumage: number; bornAt: bigint | number }; now: number }) {
  // Care proofs stay with the bird id, so a bird returned to the coop still shows what it went through before.
  const history = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "careProofs",
    args: [id, 0n, 100n],
    chainId: targetChain.id,
    query: { enabled: !!deployment, staleTime: 30_000 },
  });
  const earlier = history.data?.length ?? 0;
  return (
    <div className="stack">
      <BackLink />
      <div className="cols">
        <div className="stack">
          <div className="portrait">
            <span className="portrait-thai" lang="th" aria-hidden="true">ไก่</span>
            <BreedPortrait breed={bird.breed} sex={bird.sex} plumage={bird.plumage} tokenId={id} />
            <span className="chip">Breed illustration</span>
          </div>
        </div>
        <div className="stack">
          <div className="split start">
            <h1 className="h1">{speciesLabel(bird.breed, bird.sex)}</h1>
            <span className="band mono">{bandId(id)}</span>
          </div>
          <p className="muted">Sample bird on testnet.{earlier > 0 ? " This bird had a sponsor before." : ""}</p>
          <dl className="traits">
            <div><dt>Plumage</dt><dd>{plumageName(bird.plumage)}</dd></div>
            <div><dt>Age</dt><dd>{ageLabel(Number(bird.bornAt), now)}</dd></div>
            <div><dt>Sex</dt><dd>{sexName(bird.sex)[0]!.toUpperCase() + sexName(bird.sex).slice(1)}</dd></div>
          </dl>
          <section className="card row nowrap onchain">
            <div className="onchain-art">
              <BirdGlyph breed={bird.breed} sex={bird.sex} plumage={bird.plumage} tokenId={id} width={84} label="This bird's own art, drawn from its traits" />
            </div>
            <div className="stack tight-gap">
              <div className="strong">This bird has no sponsor yet</div>
              <div className="muted small">It waits in the coop. When someone hatches an egg, one waiting bird is drawn at random and becomes theirs to care for.</div>
            </div>
          </section>
          <Link to="/eggs" className="btn btn-primary btn-block">Get an egg</Link>
          {earlier > 0 ? <CareTimeline tokenId={id} total={earlier} now={now} /> : null}
        </div>
      </div>
    </div>
  );
}
