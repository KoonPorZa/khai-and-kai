import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { kaiAbi } from "../abi/kai";
import { Check } from "../components/Art";
import { ActionButton, useConnectModal } from "../components/Wallet";
import { CollectionRequests, OverdueBirds } from "../components/FarmQueues";
import { deployment } from "../config/chains";
import { useT } from "../i18n";
import { useChicken, useFarmRole } from "../hooks/useChain";
import { useTx } from "../hooks/useTx";
import { MAX_NOTE_BYTES, noteBytes, recordHash } from "../lib/hash";
import { bandId, parseBand, PROOF_KINDS, kindName, shortHex, speciesLabel } from "../lib/format";

export function Farm() {
  const { isConnected } = useAccount();
  const modal = useConnectModal();
  const t = useT();
  const { isFarm, isLoading } = useFarmRole();
  const tx = useTx();
  const [band, setBand] = useState("");
  const [kind, setKind] = useState(1);
  const [note, setNote] = useState("");
  const [record, setRecord] = useState("");
  const [posted, setPosted] = useState<bigint | undefined>();

  const tokenId = parseBand(band);
  const chicken = useChicken(tokenId);
  const bytes = noteBytes(note);
  const hash = recordHash(record);
  const sendable = !!deployment && !!chicken.data && bytes <= MAX_NOTE_BYTES && record.trim().length > 0;

  if (!isConnected) {
    return (
      <div className="stack narrow">
        <h1 className="h1">{t('farm.title')}</h1>
        <p className="muted">{t('farm.connectPrompt')}</p>
        <button type="button" className="btn btn-primary" onClick={modal.open}>{t('farm.connect')}</button>
      </div>
    );
  }
  if (isLoading) return <p className="muted">{t('farm.checkingRole')}</p>;
  if (!isFarm) {
    return (
      <div className="stack narrow">
        <h1 className="h1">{t('farm.title')}</h1>
        <p className="notice">{t('farm.notFarm')}</p>
        <Link to="/" className="btn btn-ghost">{t('farm.backHome')}</Link>
      </div>
    );
  }

  const submit = async () => {
    if (!deployment || tokenId === undefined) return;
    const receipt = await tx.run({
      address: deployment.kai,
      abi: kaiAbi,
      functionName: "postCareProof",
      args: [tokenId, kind, hash, note],
    });
    if (!receipt) return;
    setPosted(tokenId);
    setNote("");
    setRecord("");
    chicken.refetch();
  };

  return (
    <div className="stack farm">
      <header className="page-head">
        <h1 className="h1">{t('farm.title')}</h1>
        <p className="muted">{t('farm.intro')}</p>
      </header>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="field">
          <label htmlFor="band">{t('farm.bird')}</label>
          <input id="band" value={band} placeholder="KK-0042" autoComplete="off" onChange={(e) => { setBand(e.target.value); setPosted(undefined); }} />
          <span className="muted small">
            {band.trim() === "" ? t('farm.enterBand')
              : tokenId === undefined ? t('farm.badBand')
              : chicken.data ? t('farm.birdInfo', { species: speciesLabel(chicken.data.bird.breed, chicken.data.bird.sex), who: shortHex(chicken.data.owner) })
              : chicken.isError ? t('farm.noSponsor', { band: bandId(tokenId) }) : t('farm.lookingUp')}
          </span>
        </div>

        <fieldset className="field">
          <legend>{t('farm.whatDone')}</legend>
          <div className="chips">
            {PROOF_KINDS.map((k, i) => (
              <button key={k} type="button" className="chip-btn" aria-pressed={kind === i} onClick={() => setKind(i)}>{kindName(i)}</button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <div className="split end">
            <label htmlFor="note">{t('farm.noteLabel')}</label>
            <span className={`small ${bytes > MAX_NOTE_BYTES ? "bad-text" : "muted"}`}>{t('farm.noteCount', { n: bytes, max: MAX_NOTE_BYTES })}</span>
          </div>
          <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={bytes > MAX_NOTE_BYTES} />
          {bytes > MAX_NOTE_BYTES ? <span className="bad-text small">{t('farm.noteLimit', { max: MAX_NOTE_BYTES })}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="rec">{t('farm.recordLabel')}</label>
          <textarea id="rec" rows={3} value={record} onChange={(e) => setRecord(e.target.value)} />
          <span className="muted small">{t('farm.recordHelp')}</span>
          <span className="mono small hash">{hash}</span>
        </div>

        <ActionButton type="submit" className="btn-block" disabled={!sendable} busy={tx.busy}>
          {tx.state.status === "wallet" ? t('farm.confirmWallet') : tx.state.status === "pending" ? t('farm.posting') : t('farm.post')}
        </ActionButton>
      </form>

      {posted !== undefined ? (
        <p className="card row nowrap ok-text" role="status">
          <Check size={18} />
          <span>{t('farm.posted', { band: bandId(posted) })} <Link to={`/chicken/${posted}`}>{t('farm.seeIt')}</Link></span>
        </p>
      ) : null}

      <div className="stack farm-queues">
        <CollectionRequests />
        <OverdueBirds />
      </div>
    </div>
  );
}
