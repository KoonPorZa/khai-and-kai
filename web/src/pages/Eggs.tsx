import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { EggSvg } from "../components/Art";
import { ActionButton } from "../components/Wallet";
import { useToast } from "../components/Toast";
import { deployment, nativeSymbol, FAUCET } from "../config/chains";
import { khaiAbi } from "../abi/khai";
import { useEggInfo } from "../hooks/useChain";
import { useChainNow } from "../hooks/useChainNow";
import { useTx } from "../hooks/useTx";
import { clockTime, formatNative, nextQuotaReset } from "../lib/format";
import { hatchIdFromReceipt } from "../lib/receipt";

export function Eggs() {
  const navigate = useNavigate();
  const toast = useToast();
  const { isConnected } = useAccount();
  const egg = useEggInfo();
  const now = useChainNow();
  const hatchTx = useTx();
  const keepTx = useTx();
  const [qty, setQty] = useState(1);

  const price = egg.price;
  const limit = Number(egg.dailyLimit ?? 3n);
  const bought = egg.bought !== undefined ? Number(egg.bought) : 0;
  const remaining = egg.remaining !== undefined ? Number(egg.remaining) : undefined;
  const available = egg.available !== undefined ? Number(egg.available) : undefined;
  const maxQty = Math.max(0, Math.min(remaining ?? limit, available ?? limit));
  const q = Math.min(Math.max(1, qty), Math.max(1, maxQty));
  const resetAt = clockTime(nextQuotaReset(now));
  const deployed = !!deployment;

  let blocker: string | undefined;
  if (deployed && egg.paused) blocker = "Sales are paused right now.";
  else if (available === 0) blocker = "Every egg is spoken for. There are no birds left waiting in the coop.";
  else if (isConnected && remaining === 0) blocker = `You have used all ${limit} eggs for today. The quota resets at ${resetAt}.`;

  const canAct = deployed && price !== undefined && !blocker;

  const buyAndHatch = async () => {
    if (!deployment || price === undefined) return;
    const receipt = await hatchTx.run({ address: deployment.khai, abi: khaiAbi, functionName: "buyAndStartHatch", value: price });
    if (!receipt) return;
    const id = hatchIdFromReceipt(receipt);
    egg.refetch();
    if (id === undefined) {
      toast("ok", "Hatch started.", "Open My coop to reveal your bird.");
      navigate("/coop");
    } else navigate(`/hatch/${id}`, { state: { fresh: true } });
  };

  const buyToKeep = async () => {
    if (!deployment || price === undefined) return;
    const receipt = await keepTx.run({ address: deployment.khai, abi: khaiAbi, functionName: "buy", args: [BigInt(q)], value: price * BigInt(q) });
    if (!receipt) return;
    egg.refetch();
    toast("ok", `${q} ${q === 1 ? "egg" : "eggs"} added to your coop.`);
    navigate("/coop");
  };

  return (
    <div className="stack">
      <header className="page-head">
        <h1 className="h1">Get an egg</h1>
        <p className="muted">One egg hatches into one bird from the coop. You find out which when it hatches.</p>
      </header>

      <div className="eggs-grid">
        <div className="stack">
          <section className="card egg-card">
            <span className="egg-thai" lang="th" aria-hidden="true">ไข่</span>
            <div className="egg-glow">
              <EggSvg width={132} />
            </div>
            <div className="price">
              <span className="price-num">{price !== undefined ? formatNative(price) : "0.01"}</span>
              <span className="muted">{nativeSymbol} each</span>
            </div>
          </section>
          <div className="two">
            <div className="card tight">
              <div className="muted small">Eggs left</div>
              <div className="stat">{available !== undefined ? available : "…"}</div>
              <div className="muted tiny">one per bird waiting</div>
            </div>
            <div className="card tight">
              <div className="muted small">Your eggs today</div>
              <div className="pips" role="img" aria-label={isConnected ? `${bought} of ${limit} used` : "Connect a wallet to see your quota"}>
                {Array.from({ length: limit }, (_, i) => (
                  <span key={i} className={`pip ${i < bought ? "pip-used" : ""}`} />
                ))}
              </div>
              <div className="muted tiny">{isConnected ? `${bought} of ${limit} used, resets ${resetAt}` : `Up to ${limit} a day`}</div>
            </div>
          </div>
        </div>

        <div className="stack">
          {blocker ? <p className="notice" role="status">{blocker}</p> : null}
          <div className="stack tight-gap">
            <ActionButton className="btn-xl" onClick={buyAndHatch} disabled={!canAct} busy={hatchTx.busy}>
              {hatchTx.state.status === "wallet" ? "Confirm in your wallet…" : hatchTx.state.status === "pending" ? "Starting the hatch…" : "Buy and hatch now"}
            </ActionButton>
            <p className="muted small center">Two wallet confirmations: one to buy and start, one to reveal your bird.</p>
          </div>

          <section className="card outline">
            <div className="strong">Or keep eggs for later</div>
            <div className="row nowrap">
              <label htmlFor="qty" className="muted small">Quantity</label>
              <div className="stepper">
                <button type="button" aria-label="One fewer" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1}>&minus;</button>
                <input
                  id="qty"
                  value={q}
                  inputMode="numeric"
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                    setQty(Number.isFinite(n) ? n : 1);
                  }}
                />
                <button type="button" aria-label="One more" onClick={() => setQty(Math.min(Math.max(1, maxQty), q + 1))} disabled={q >= maxQty}>+</button>
              </div>
              <span className="mono total">{price !== undefined ? `${formatNative(price * BigInt(q))} ${nativeSymbol}` : "—"}</span>
            </div>
            <ActionButton variant="outline" onClick={buyToKeep} disabled={!canAct || maxQty < 1} busy={keepTx.busy}>
              {keepTx.state.status === "wallet" ? "Confirm in your wallet…" : keepTx.state.status === "pending" ? "Buying…" : `Buy ${q} ${q === 1 ? "egg" : "eggs"}`}
            </ActionButton>
            <p className="muted small">Eggs sit in your coop until you hatch them. You can also send one to a friend.</p>
          </section>
          <p className="muted small">
            Need test coins? Get {nativeSymbol} from the <a href={FAUCET} target="_blank" rel="noreferrer">BNB testnet faucet</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
