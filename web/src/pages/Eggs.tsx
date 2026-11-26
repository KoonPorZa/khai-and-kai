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
import { useT } from "../i18n";
import { useTx } from "../hooks/useTx";
import { clockTime, formatNative, nextQuotaReset } from "../lib/format";
import { hatchIdFromReceipt } from "../lib/receipt";

/** Above this many eggs a day, the quota shows as a number and a bar, not one pip per egg. */
const MAX_PIPS = 6;

export function Eggs() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
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
  if (deployed && egg.paused) blocker = t("eggs.paused");
  else if (available === 0) blocker = t("eggs.soldOut");
  else if (isConnected && remaining === 0) blocker = t("eggs.limitReached", { limit, time: resetAt });

  const canAct = deployed && price !== undefined && !blocker;

  const buyAndHatch = async () => {
    if (!deployment || price === undefined) return;
    const receipt = await hatchTx.run({ address: deployment.khai, abi: khaiAbi, functionName: "buyAndStartHatch", value: price });
    if (!receipt) return;
    const id = hatchIdFromReceipt(receipt);
    egg.refetch();
    if (id === undefined) {
      toast("ok", t("eggs.toastHatchStarted"), t("eggs.toastOpenCoop"));
      navigate("/coop");
    } else navigate(`/hatch/${id}`, { state: { fresh: true } });
  };

  const buyToKeep = async () => {
    if (!deployment || price === undefined) return;
    const receipt = await keepTx.run({ address: deployment.khai, abi: khaiAbi, functionName: "buy", args: [BigInt(q)], value: price * BigInt(q) });
    if (!receipt) return;
    egg.refetch();
    toast("ok", t(q === 1 ? "eggs.toastAddedOne" : "eggs.toastAddedMany", { n: q }));
    navigate("/coop");
  };

  return (
    <div className="stack">
      <header className="page-head">
        <h1 className="h1">{t("eggs.title")}</h1>
        <p className="muted">{t("eggs.lede")}</p>
      </header>

      <div className="eggs-grid">
        <div className="stack">
          <section className="card egg-card">
            <span className="egg-thai" lang="th" aria-hidden="true">ไข่</span>
            <div className="egg-glow">
              <EggSvg width={132} />
            </div>
            <div className="price">
              <span className="price-num">{price !== undefined ? formatNative(price) : "0.001"}</span>
              <span className="muted">{t("eggs.each", { symbol: nativeSymbol })}</span>
            </div>
          </section>
          <div className="two">
            <div className="card tight">
              <div className="muted small">{t("eggs.left")}</div>
              <div className="stat">{available !== undefined ? available : "…"}</div>
              <div className="muted tiny">{t("eggs.leftNote")}</div>
            </div>
            <div className="card tight">
              <div className="muted small">{limit > MAX_PIPS ? t("eggs.canStill") : t("eggs.today")}</div>
              {limit > MAX_PIPS ? (
                <>
                  <div className="stat">{isConnected ? Math.max(limit - bought, 0) : limit}</div>
                  <div className="quota-bar" role="img" aria-label={isConnected ? t("eggs.quotaUsedAria", { used: bought, limit }) : t("eggs.quotaConnect")}>
                    <span style={{ width: `${isConnected ? Math.min((bought / limit) * 100, 100) : 0}%` }} />
                  </div>
                </>
              ) : (
                <div className="pips" role="img" aria-label={isConnected ? t("eggs.quotaUsedAria", { used: bought, limit }) : t("eggs.quotaConnect")}>
                  {Array.from({ length: limit }, (_, i) => (
                    <span key={i} className={`pip ${i < bought ? "pip-used" : ""}`} />
                  ))}
                </div>
              )}
              <div className="muted tiny">{isConnected ? t("eggs.quotaUsed", { used: bought, limit, time: resetAt }) : t("eggs.quotaUpTo", { limit })}</div>
            </div>
          </div>
        </div>

        <div className="stack">
          {blocker ? <p className="notice" role="status">{blocker}</p> : null}
          <div className="stack tight-gap">
            <ActionButton className="btn-xl" onClick={buyAndHatch} disabled={!canAct} busy={hatchTx.busy}>
              {hatchTx.state.status === "wallet" ? t("common.confirmWallet") : hatchTx.state.status === "pending" ? t("eggs.starting") : t("eggs.buyHatch")}
            </ActionButton>
            <p className="muted small center">{t("eggs.twoConfirm")}</p>
          </div>

          <section className="card outline">
            <div className="strong">{t("eggs.keepTitle")}</div>
            <div className="row nowrap">
              <label htmlFor="qty" className="muted small">{t("eggs.quantity")}</label>
              <div className="stepper">
                <button type="button" aria-label={t("eggs.fewer")} onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1}>&minus;</button>
                <input
                  id="qty"
                  value={q}
                  inputMode="numeric"
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                    setQty(Number.isFinite(n) ? n : 1);
                  }}
                />
                <button type="button" aria-label={t("eggs.more")} onClick={() => setQty(Math.min(Math.max(1, maxQty), q + 1))} disabled={q >= maxQty}>+</button>
              </div>
              <span className="mono total">{price !== undefined ? `${formatNative(price * BigInt(q))} ${nativeSymbol}` : "—"}</span>
            </div>
            <ActionButton variant="outline" onClick={buyToKeep} disabled={!canAct || maxQty < 1} busy={keepTx.busy}>
              {keepTx.state.status === "wallet" ? t("common.confirmWallet") : keepTx.state.status === "pending" ? t("eggs.buying") : t(q === 1 ? "eggs.buyOne" : "eggs.buyMany", { n: q })}
            </ActionButton>
            <p className="muted small">{t("eggs.keepNote")}</p>
          </section>
          <p className="muted small">
            {t("eggs.faucetBefore", { symbol: nativeSymbol })}<a href={FAUCET} target="_blank" rel="noreferrer">{t("wallet.faucetLink")}</a>{t("wallet.faucetAfter")}
          </p>
        </div>
      </div>
    </div>
  );
}
