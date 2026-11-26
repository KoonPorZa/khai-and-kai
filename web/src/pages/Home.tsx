import { Link } from "react-router-dom";
import { CoopGrid } from "../components/CoopGrid";
import { deployment, GITHUB } from "../config/chains";
import { useCollectedIds, useSponsoredIds, useStats, useCareParams, useEggInfo } from "../hooks/useChain";
import { formatNative, formatNumber } from "../lib/format";
import { nativeSymbol } from "../config/chains";
import { artManifest } from "../lib/art";
import { useT } from "../i18n";
import { useMediaQuery } from "../hooks/useMediaQuery";

function Hero() {
  const t = useT();
  return (
    <section className="hero">
      <div className="hero-thai" lang="th" aria-hidden="true">
        <span>ไข่</span>
        <svg className="hero-arrow" viewBox="0 0 36 24" aria-hidden="true">
          <path d="M2 12 H30 M22 4 L31 12 L22 20" fill="none" stroke="#8c95a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="accent">ไก่</span>
      </div>
      <h1 className="display">{t("home.title")}</h1>
      <p className="lede">
        {t("home.lede")}
      </p>
      <div className="row">
        <Link to="/eggs" className="btn btn-primary btn-lg">{t("home.getEgg")}</Link>
        <a href={GITHUB} target="_blank" rel="noreferrer" className="btn btn-ghost btn-lg desktop-only">{t("home.readContracts")}</a>
      </div>
    </section>
  );
}

function CoopTonight() {
  const t = useT();
  const stats = useStats();
  const s = stats.data;
  const total = s ? Number(s.birdsRegistered) : 0;
  const hatched = s ? Number(s.hatched) : undefined;
  const { ids } = useSponsoredIds(hatched);
  const collectedCount = s ? Number(s.collected) : 0;
  const collectedIds = useCollectedIds(ids, collectedCount > 0);
  const wide = useMediaQuery("(min-width: 900px)");
  return (
    <section className="card coop-card" aria-labelledby="coop-title">
      <div className="split">
        <h2 id="coop-title" className="h2">{t("home.coopTonight")}</h2>
        <span className="muted small">{s ? t("home.birdsRegistered", { n: formatNumber(total) }) : deployment ? t("home.reading") : t("home.notDeployedShort")}</span>
      </div>
      {s && total > 0 ? (
        <CoopGrid total={total} sponsored={ids} pending={Number(s.pendingHatches)} columns={wide ? 25 : 20} collected={collectedIds} />
      ) : (
        <div className="empty-grid">{deployment ? (stats.isLoading ? t("home.loadingCoop") : t("home.noBirds")) : t("home.gridAfterDeploy")}</div>
      )}
      <p className="muted small">
        {t("home.gridHelp")}
        {s ? t("home.careRecords", { n: formatNumber(s.careProofs) }) : ""}{s ? t("home.hatchedSoFar", { n: formatNumber(s.hatchCount) }) : ""}{collectedCount > 0 ? t(collectedCount === 1 ? "home.collectedOne" : "home.collectedMany", { n: formatNumber(collectedCount) }) : ""}.
      </p>
    </section>
  );
}

function HowItWorks() {
  const t = useT();
  const egg = useEggInfo();
  const care = useCareParams();
  const feeText = care.careFee !== undefined ? ` (${formatNative(care.careFee)} ${nativeSymbol})` : "";
  const steps = [
    [t("home.step1Title"), t("home.step1Body", { price: egg.price !== undefined ? formatNative(egg.price) : "0.001", symbol: nativeSymbol, limit: egg.dailyLimit !== undefined ? String(egg.dailyLimit) : "20" })],
    [t("home.step2Title"), t("home.step2Body")],
    [t("home.step3Title"), t("home.step3Body", { fee: feeText })],
    [t("home.step4Title"), t("home.step4Body")],
  ] as const;
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title" className="h2 h2-lg">{t("home.how")}</h2>
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
