import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAccount, useBalance, useBlockNumber, useReadContract, useReadContracts } from "wagmi";
import { BirdThumb, EggSvg, Warn } from "../components/Art";
import { ActionButton, useConnectModal } from "../components/Wallet";
import { kaiAbi } from "../abi/kai";
import { khaiAbi } from "../abi/khai";
import { deployment, nativeSymbol, targetChain } from "../config/chains";
import { useChainNow } from "../hooks/useChainNow";
import { useTx } from "../hooks/useTx";
import { bandId, formatDuration, formatNative, formatNumber, speciesLabel } from "../lib/format";
import { artManifest } from "../lib/art";
import { hatchIdFromReceipt } from "../lib/receipt";

const chainId = targetChain.id;

export function Coop() {
  const { address, isConnected } = useAccount();
  const modal = useConnectModal();
  const navigate = useNavigate();
  const now = useChainNow();
  const startTx = useTx();
  const balance = useBalance({ address, chainId, query: { enabled: !!address, refetchInterval: 10_000 } });
  const block = useBlockNumber({ chainId, cacheTime: 0, query: { refetchInterval: 3000 } });

  const eggs = useReadContract({
    address: deployment?.khai,
    abi: khaiAbi,
    functionName: "balanceOf",
    args: [address as `0x${string}`, 1n],
    chainId,
    query: { enabled: !!deployment && !!address, refetchInterval: 5000 },
  });
  const hatchIds = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "hatchesOf",
    args: [address as `0x${string}`],
    chainId,
    query: { enabled: !!deployment && !!address, refetchInterval: 5000 },
  });
  const hatches = useReadContracts({
    contracts: (hatchIds.data ?? []).map((id) => ({ address: deployment!.kai, abi: kaiAbi, functionName: "hatch" as const, args: [id] as const, chainId })),
    query: { enabled: !!deployment && (hatchIds.data?.length ?? 0) > 0, refetchInterval: 5000 },
  });
  const chickens = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "chickensOf",
    args: [address as `0x${string}`],
    chainId,
    query: { enabled: !!deployment && !!address, refetchInterval: 5000 },
  });

  const eggCount = Number(eggs.data ?? 0n);
  const pending = (hatchIds.data ?? [])
    .map((id, i) => ({ id, hatch: hatches.data?.[i]?.result }))
    .filter((h) => h.hatch && h.hatch.birdId === 0);
  const list = chickens.data ?? [];
  const overdueCount = list.filter((c) => BigInt(now) > c.carePaidUntil).length;
  const loading = isConnected && (eggs.isLoading || chickens.isLoading || hatchIds.isLoading);
  const empty = isConnected && !loading && eggCount === 0 && pending.length === 0 && list.length === 0;

  const hatchOne = async () => {
    if (!deployment) return;
    const receipt = await startTx.run({ address: deployment.kai, abi: kaiAbi, functionName: "startHatch" });
    if (!receipt) return;
    const id = hatchIdFromReceipt(receipt);
    eggs.refetch();
    hatchIds.refetch();
    if (id !== undefined) navigate(`/hatch/${id}`, { state: { fresh: true } });
  };

  if (!isConnected) {
    return (
      <div className="stack narrow">
        <h1 className="h1">My coop</h1>
        <p className="muted">Connect a wallet to see your eggs, hatches and chickens.</p>
        <button type="button" className="btn btn-primary" onClick={modal.open}>Connect wallet</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="split end">
        <h1 className="h1">My coop</h1>
        <span className="mono muted small">{balance.data ? `${formatNative(balance.data.value)} ${nativeSymbol}` : ""}</span>
      </header>

      {pending.map(({ id, hatch }) => {
        const ready = block.data !== undefined && hatch && block.data > hatch.revealBlock;
        return (
          <div key={String(id)} className="card hatch-banner">
            <EggSvg width={30} cracked label="" />
            <div className="grow">
              <div className="strong">{ready ? `Hatch #${id} is ready to reveal` : `Hatch #${id} is warming up`}</div>
              <div className="muted small">{ready ? "Anyone can finish it. It takes one confirmation." : `Reveal block ${hatch ? formatNumber(hatch.revealBlock) : ""}`}</div>
            </div>
            <Link to={`/hatch/${id}`} className="btn btn-violet">{ready ? "Reveal" : "Open"}</Link>
          </div>
        );
      })}

      {eggCount > 0 ? (
        <section className="stack tight-gap">
          <h2 className="h2">Eggs</h2>
          <div className="card row nowrap">
            <div className="egg-row" aria-hidden="true">
              {Array.from({ length: Math.min(eggCount, 4) }, (_, i) => <EggSvg key={i} width={26} label="" />)}
            </div>
            <div className="grow">
              <div className="strong">{eggCount} {eggCount === 1 ? "egg" : "eggs"} waiting</div>
              <div className="muted small">Each hatches into one bird</div>
            </div>
            <ActionButton variant="primary" onClick={hatchOne} busy={startTx.busy}>
              {startTx.busy ? "Starting…" : "Hatch one"}
            </ActionButton>
          </div>
        </section>
      ) : null}

      {list.length > 0 ? (
        <section className="stack tight-gap">
          <div className="split end">
            <h2 className="h2">Chickens</h2>
            <span className="muted small">{list.length} sponsored{overdueCount ? `, ${overdueCount} needs care` : ""}</span>
          </div>
          <div className="chicken-list">
            {list.map((c) => {
              const left = Number(c.carePaidUntil) - now;
              const overdue = left < 0;
              return (
                <Link key={String(c.tokenId)} to={`/chicken/${c.tokenId}`} className={`card chicken-card ${overdue ? "is-overdue" : ""}`}>
                  <span className="chicken-art"><BirdThumb breed={c.bird.breed} sex={c.bird.sex} plumage={c.bird.plumage} tokenId={c.tokenId} width={70} /></span>
                  <span className="chicken-meta">
                    <span className="strong">{speciesLabel(c.bird.breed, c.bird.sex)}</span>
                    <span className="mono muted small">{bandId(c.tokenId)}</span>
                    <span className={`status ${overdue ? "status-bad" : "status-ok"}`}>
                      {overdue ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 L11.5 11 H0.5 Z" fill="currentColor" /></svg> : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>}
                      {overdue ? `Care overdue ${formatDuration(-left)}` : `Care paid, ${formatDuration(left)} left`}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {loading ? <p className="muted">Reading your coop from the chain…</p> : null}

      {empty ? (
        <section className="card empty">
          {artManifest.emptyCoop ? <img className="empty-art" src={artManifest.emptyCoop} width={800} height={600} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : <EggSvg width={56} />}
          <div className="strong">Your coop is empty</div>
          <p className="muted">Hatch your first egg to sponsor a bird. It takes two confirmations and about ten seconds.</p>
          <Link to="/eggs" className="btn btn-primary">Get an egg</Link>
        </section>
      ) : null}
      {overdueCount > 0 ? (
        <p className="notice row nowrap"><Warn size={18} /> A chicken with unpaid care can't be transferred. Open it to pay.</p>
      ) : null}
    </div>
  );
}
