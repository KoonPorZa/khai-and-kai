import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useConfig, useReadContract, useReadContracts } from "wagmi";
import { readContract } from "wagmi/actions";
import type { Address } from "viem";
import { kaiAbi } from "../abi/kai";
import { ActionButton } from "./Wallet";
import { deployment, targetChain } from "../config/chains";
import { useSponsoredIds, useStats } from "../hooks/useChain";
import { useTx } from "../hooks/useTx";
import { useToast } from "./Toast";
import { recordHash } from "../lib/hash";
import { bandId, formatWhen, shortHex, speciesLabel } from "../lib/format";
import { useT } from "../i18n";
import { useChainNow } from "../hooks/useChainNow";

const chainId = targetChain.id;

/**
 * A button that explains an irreversible action first and only then sends it.
 * `onOpen` runs when the prompt opens (the row remembers what it showed); `onConfirm` may return "abort" to close the prompt without sending.
 */
function ConfirmAction({ label, warning, yes, busy, disabled, yesDisabled, onOpen, onConfirm }: { label: string; warning: string; yes: string; busy: boolean; disabled?: boolean; yesDisabled?: boolean; onOpen?: () => void; onConfirm: () => Promise<"abort" | void> }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-outline"
        disabled={disabled || busy}
        onClick={() => {
          onOpen?.();
          setAsking(true);
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <div className="stack tight-gap" role="group" aria-label={t('farm.confirmGroup', { label })}>
      <p className="notice small">{warning}</p>
      <div className="row">
        <ActionButton
          variant="coral"
          busy={busy}
          disabled={yesDisabled}
          onClick={() => {
            void onConfirm().then((r) => {
              if (r === "abort") setAsking(false);
            });
          }}
        >
          {busy ? t('farm.sending') : yes}
        </ActionButton>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setAsking(false)}>
          {t('farm.keep')}
        </button>
      </div>
    </div>
  );
}

type TokenView = { owner: string; redeemRequestedAt: bigint; redeemedAt: bigint; carePaidUntil: bigint };
const sameOwner = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Re-reads one chicken right before a farm action; undefined when the token is gone. */
function useFreshChicken() {
  const config = useConfig();
  return async (id: bigint): Promise<TokenView | undefined> => {
    try {
      return (await readContract(config, { address: deployment!.kai, abi: kaiAbi, functionName: "chicken", args: [id], chainId })) as TokenView;
    } catch {
      return undefined;
    }
  };
}

function useChickens(ids: readonly bigint[]) {
  const contracts = useMemo(
    () => ids.map((id) => ({ address: deployment?.kai as Address, abi: kaiAbi, functionName: "chicken" as const, args: [id] as const, chainId })),
    [ids],
  );
  const q = useReadContracts({ contracts, allowFailure: true, query: { enabled: !!deployment && ids.length > 0, refetchInterval: 8000 } });
  return (i: number) => {
    const r = q.data?.[i];
    return r?.status === "success" ? r.result : undefined;
  };
}

export function CollectionRequests() {
  const t = useT();
  const now = useChainNow();
  const pending = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "pendingRedeems",
    chainId,
    query: { enabled: !!deployment, refetchInterval: 8000 },
  });
  const ids = pending.data ?? [];
  const chicken = useChickens(ids);
  return (
    <section className="card stack" aria-labelledby="requests-title">
      <h2 id="requests-title" className="h2">{t('farm.requestsTitle')}</h2>
      {ids.length === 0 ? (
        <p className="muted">{t('farm.requestsEmpty')}</p>
      ) : (
        <div className="queue">
          {ids.map((id, i) => (
            <RequestRow key={String(id)} id={id} chicken={chicken(i)} now={now} onDone={() => pending.refetch()} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestRow({ id, chicken, now, onDone }: { id: bigint; chicken: ReturnType<ReturnType<typeof useChickens>>; now: number; onDone: () => void }) {
  const t = useT();
  const tx = useTx();
  const toast = useToast();
  const fresh = useFreshChicken();
  const [record, setRecord] = useState("");
  const [shown, setShown] = useState<{ owner: string; requestedAt: bigint } | undefined>();
  const hash = recordHash(record);
  const remember = () => setShown(chicken ? { owner: chicken.owner, requestedAt: chicken.redeemRequestedAt } : undefined);
  const decline = useTx();
  /** Aborts (returns false) unless the request is still exactly what the prompt showed. */
  const unchanged = async () => {
    const now = await fresh(id);
    const ok = !!shown && !!now && sameOwner(now.owner, shown.owner) && now.redeemRequestedAt === shown.requestedAt && now.redeemRequestedAt > 0n && now.redeemedAt === 0n;
    if (!ok) {
      toast("error", t('farm.changed'));
      onDone();
    }
    return ok;
  };
  const declineRequest = async (): Promise<"abort" | void> => {
    if (!deployment) return;
    if (!(await unchanged())) return "abort";
    const receipt = await decline.run({ address: deployment.kai, abi: kaiAbi, functionName: "declineRedeem", args: [id] });
    if (receipt) onDone();
  };
  const confirm = async (): Promise<"abort" | void> => {
    if (!deployment || record.trim().length === 0) return;
    if (!(await unchanged())) return "abort";
    const receipt = await tx.run({ address: deployment.kai, abi: kaiAbi, functionName: "confirmRedeem", args: [id, hash] });
    if (receipt) onDone();
  };
  return (
    <div className="queue-row">
      <div className="split start">
        <div>
          <Link to={`/chicken/${id}`} className="strong">{chicken ? speciesLabel(chicken.bird.breed, chicken.bird.sex) : t('farm.chicken')} {bandId(id)}</Link>
          <div className="muted small">
            {chicken ? t('farm.requestLine', { who: shortHex(chicken.owner), when: formatWhen(Number(chicken.redeemRequestedAt), now) }) : t('farm.reading')}
          </div>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`handover-${id}`}>{t('farm.handoverLabel')}</label>
        <textarea id={`handover-${id}`} rows={2} value={record} onChange={(e) => setRecord(e.target.value)} placeholder={t('farm.handoverPlaceholder')} />
        <span className="muted small">{t('farm.noPersonal')}</span>
        <span className="mono small hash">{hash}</span>
      </div>
      <div className="row">
      <ConfirmAction
        label={t('farm.confirmHandover')}
        warning={t('farm.confirmWarning', { band: bandId(id) })}
        yes={t('farm.confirmYes')}
        busy={tx.busy}
        disabled={record.trim().length === 0}
        yesDisabled={record.trim().length === 0}
        onOpen={remember}
        onConfirm={confirm}
      />
      <ConfirmAction
        label={t('farm.decline')}
        warning={t('farm.declineWarning', { band: bandId(id) })}
        yes={t('farm.declineYes')}
        busy={decline.busy}
        onOpen={remember}
        onConfirm={declineRequest}
      />
      </div>
    </div>
  );
}

export function OverdueBirds() {
  const t = useT();
  const stats = useStats();
  const hatched = stats.data ? Number(stats.data.hatched) : undefined;
  const { ids } = useSponsoredIds(hatched);
  const list = useMemo(() => [...ids].sort((a, b) => a - b).map(BigInt), [ids]);
  const flags = useReadContracts({
    contracts: list.map((id) => ({ address: deployment?.kai as Address, abi: kaiAbi, functionName: "isReleasable" as const, args: [id] as const, chainId })),
    allowFailure: true,
    query: { enabled: !!deployment && list.length > 0, refetchInterval: 10_000 },
  });
  const releasable = list.filter((_, i) => flags.data?.[i]?.status === "success" && flags.data[i].result === true);
  const chicken = useChickens(releasable);
  return (
    <section className="card stack" aria-labelledby="overdue-title">
      <h2 id="overdue-title" className="h2">{t('farm.overdueTitle')}</h2>
      {releasable.length === 0 ? (
        <p className="muted">{t('farm.overdueEmpty')}</p>
      ) : (
        <div className="queue">
          {releasable.map((id, i) => (
            <ReleaseRow key={String(id)} id={id} chicken={chicken(i)} onDone={() => flags.refetch()} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReleaseRow({ id, chicken, onDone }: { id: bigint; chicken: ReturnType<ReturnType<typeof useChickens>>; onDone: () => void }) {
  const t = useT();
  const tx = useTx();
  const now = useChainNow();
  const toast = useToast();
  const fresh = useFreshChicken();
  const [shown, setShown] = useState<{ owner: string; paidUntil: bigint; requestedAt: bigint } | undefined>();
  const release = async (): Promise<"abort" | void> => {
    if (!deployment) return;
    const current = await fresh(id);
    if (!shown || !current || !sameOwner(current.owner, shown.owner) || current.carePaidUntil !== shown.paidUntil || current.redeemedAt !== 0n || current.redeemRequestedAt !== shown.requestedAt) {
      toast("error", t('farm.changed'));
      onDone();
      return "abort";
    }
    const receipt = await tx.run({ address: deployment.kai, abi: kaiAbi, functionName: "release", args: [id] });
    if (receipt) onDone();
  };
  return (
    <div className="queue-row">
      <div>
        <Link to={`/chicken/${id}`} className="strong">{chicken ? speciesLabel(chicken.bird.breed, chicken.bird.sex) : t('farm.chicken')} {bandId(id)}</Link>
        <div className="muted small">
          {chicken ? t('farm.ranOut', { who: shortHex(chicken.owner), when: formatWhen(Number(chicken.carePaidUntil), now) }) : t('farm.reading')}
        </div>
      </div>
      <ConfirmAction
        label={t('farm.returnLabel')}
        warning={t('farm.returnWarning', { band: bandId(id) })}
        yes={t('farm.returnYes')}
        busy={tx.busy}
        onOpen={() => setShown(chicken ? { owner: chicken.owner, paidUntil: chicken.carePaidUntil, requestedAt: chicken.redeemRequestedAt } : undefined)}
        onConfirm={release}
      />
    </div>
  );
}
