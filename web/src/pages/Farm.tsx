import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { kaiAbi } from "../abi/kai";
import { Check } from "../components/Art";
import { ActionButton, useConnectModal } from "../components/Wallet";
import { CollectionRequests, OverdueBirds } from "../components/FarmQueues";
import { deployment } from "../config/chains";
import { useChicken, useFarmRole } from "../hooks/useChain";
import { useTx } from "../hooks/useTx";
import { MAX_NOTE_BYTES, noteBytes, recordHash } from "../lib/hash";
import { bandId, parseBand, PROOF_KINDS, shortHex, speciesLabel } from "../lib/format";

export function Farm() {
  const { isConnected } = useAccount();
  const modal = useConnectModal();
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
        <h1 className="h1">Post a care record</h1>
        <p className="muted">Connect the farm wallet to post records.</p>
        <button type="button" className="btn btn-primary" onClick={modal.open}>Connect wallet</button>
      </div>
    );
  }
  if (isLoading) return <p className="muted">Checking this wallet's role…</p>;
  if (!isFarm) {
    return (
      <div className="stack narrow">
        <h1 className="h1">Post a care record</h1>
        <p className="notice">This page is for the farm account.</p>
        <Link to="/" className="btn btn-ghost">Back to the home page</Link>
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
        <h1 className="h1">Post a care record</h1>
        <p className="muted">Sponsors see this on their chicken's page as soon as the transaction confirms.</p>
      </header>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="field">
          <label htmlFor="band">Bird</label>
          <input id="band" value={band} placeholder="KK-0042" autoComplete="off" onChange={(e) => { setBand(e.target.value); setPosted(undefined); }} />
          <span className="muted small">
            {band.trim() === "" ? "Enter the leg-band id of a sponsored bird."
              : tokenId === undefined ? "That is not a band id. Use the form KK-0042."
              : chicken.data ? `${speciesLabel(chicken.data.bird.breed, chicken.data.bird.sex)}, sponsored by ${shortHex(chicken.data.owner)}`
              : chicken.isError ? `${bandId(tokenId)} has no sponsor yet.` : "Looking up…"}
          </span>
        </div>

        <fieldset className="field">
          <legend>What was done</legend>
          <div className="chips">
            {PROOF_KINDS.map((k, i) => (
              <button key={k} type="button" className="chip-btn" aria-pressed={kind === i} onClick={() => setKind(i)}>{k}</button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <div className="split end">
            <label htmlFor="note">Note for the sponsor</label>
            <span className={`small ${bytes > MAX_NOTE_BYTES ? "bad-text" : "muted"}`}>{bytes} of {MAX_NOTE_BYTES}</span>
          </div>
          <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={bytes > MAX_NOTE_BYTES} />
          {bytes > MAX_NOTE_BYTES ? <span className="bad-text small">The note is limited to {MAX_NOTE_BYTES} bytes.</span> : null}
        </div>

        <div className="field">
          <label htmlFor="rec">Farm record to fingerprint</label>
          <textarea id="rec" rows={3} value={record} onChange={(e) => setRecord(e.target.value)} />
          <span className="muted small">Only a fingerprint of this text goes on-chain, so the paper record can be checked against it later.</span>
          <span className="mono small hash">{hash}</span>
        </div>

        <ActionButton type="submit" className="btn-block" disabled={!sendable} busy={tx.busy}>
          {tx.state.status === "wallet" ? "Confirm in your wallet…" : tx.state.status === "pending" ? "Posting…" : "Post care record"}
        </ActionButton>
      </form>

      {posted !== undefined ? (
        <p className="card row nowrap ok-text" role="status">
          <Check size={18} />
          <span>Care record posted for {bandId(posted)}. <Link to={`/chicken/${posted}`}>See it on the chicken's page</Link></span>
        </p>
      ) : null}

      <div className="stack farm-queues">
        <CollectionRequests />
        <OverdueBirds />
      </div>
    </div>
  );
}
