import { Link } from "react-router-dom";
import { CoopGrid } from "../components/CoopGrid";
import { deployment, GITHUB } from "../config/chains";
import { useSponsoredIds, useStats, useCareParams, useEggInfo } from "../hooks/useChain";
import { formatNative, formatNumber } from "../lib/format";
import { nativeSymbol } from "../config/chains";
import { artManifest } from "../lib/art";
import { useMediaQuery } from "../hooks/useMediaQuery";

function Hero() {
  return (
    <section className="hero">
      <div className="hero-thai" lang="th" aria-hidden="true">
        <span>ไข่</span>
        <svg className="hero-arrow" viewBox="0 0 36 24" aria-hidden="true">
          <path d="M2 12 H30 M22 4 L31 12 L22 20" fill="none" stroke="#8c95a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="accent">ไก่</span>
      </div>
      <h1 className="display">Sponsor a real farm chicken, from egg to coop.</h1>
      <p className="lede">
        Khai means egg. Kai means chicken. Buy an egg, hatch it, and one registered bird becomes yours to care for. Every feeding and health check is posted on-chain.
      </p>
      <div className="row">
        <Link to="/eggs" className="btn btn-primary btn-lg">Get an egg</Link>
        <a href={GITHUB} target="_blank" rel="noreferrer" className="btn btn-ghost btn-lg desktop-only">Read the contracts</a>
      </div>
    </section>
  );
}

function CoopTonight() {
  const stats = useStats();
  const s = stats.data;
  const total = s ? Number(s.birdsRegistered) : 0;
  const hatched = s ? Number(s.hatched) : undefined;
  const { ids } = useSponsoredIds(hatched);
  const wide = useMediaQuery("(min-width: 900px)");
  return (
    <section className="card coop-card" aria-labelledby="coop-title">
      <div className="split">
        <h2 id="coop-title" className="h2">The coop tonight</h2>
        <span className="muted small">{s ? `${formatNumber(total)} birds registered` : deployment ? "Reading the contract…" : "Not deployed yet"}</span>
      </div>
      {s && total > 0 ? (
        <CoopGrid total={total} sponsored={ids} pending={Number(s.pendingHatches)} columns={wide ? 25 : 20} />
      ) : (
        <div className="empty-grid">{deployment ? (stats.isLoading ? "Loading the coop…" : "No birds are registered yet.") : "The grid appears after the contracts are deployed."}</div>
      )}
      <p className="muted small">
        Each window is one bird. It lights up when someone hatches its egg. Tap a lit window to open that chicken. Read straight from the contract
        {s ? `, ${formatNumber(s.careProofs)} care records so far` : ""}.
      </p>
    </section>
  );
}

function HowItWorks() {
  const egg = useEggInfo();
  const care = useCareParams();
  const steps = [
    ["Get an egg", `${egg.price !== undefined ? formatNative(egg.price) : "0.001"} ${nativeSymbol}. Up to ${egg.dailyLimit !== undefined ? String(egg.dailyLimit) : "20"} a day, and never more eggs than birds in the coop.`],
    ["Hatch it", "A block hash picks your bird. No bird is drawn twice, and you can check the draw yourself."],
    ["Keep it cared for", `Pay the care fee${care.careFee !== undefined ? ` (${formatNative(care.careFee)} ${nativeSymbol})` : ""} each period. The farm posts what it did. A chicken with unpaid care can't change hands.`],
  ] as const;
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title" className="h2 h2-lg">How it works</h2>
      <ol className="steps">
        {steps.map(([title, text], i) => (
          <li key={title} className="step">
            <span className="step-num">{i + 1}</span>
            <div>
              <div className="strong">{title}</div>
              <div className="muted">{text}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Home() {
  return (
    <div className="home">
      <div className="home-top">
        {artManifest.hero ? <img className="hero-art" src={artManifest.hero} alt="" aria-hidden="true" width={1600} height={1000} decoding="async" fetchPriority="high" /> : null}
        <Hero />
        <CoopTonight />
      </div>
      <HowItWorks />
    </div>
  );
}
