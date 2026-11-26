import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { deployment, EXPLORER, GITHUB, networkLabel } from "../config/chains";
import { useFarmRole } from "../hooks/useChain";
import { shortHex } from "../lib/format";
import { useLang, useT } from "../i18n";
import { LogoMark } from "./Art";
import { NetworkBadge, WalletButton } from "./Wallet";

function Brand() {
  return (
    <Link to="/" className="brand">
      <LogoMark size={30} />
      <span className="brand-name">Khai &amp; Kai</span> <span className="brand-thai" lang="th">ไข่ ไก่</span>
    </Link>
  );
}

function Nav({ className, label }: { className: string; label: string }) {
  const { isFarm } = useFarmRole();
  const t = useT();
  return (
    <nav className={className} aria-label={label}>
      <NavLink to="/" end>{t("nav.home")}</NavLink>
      <NavLink to="/eggs">{t("nav.eggs")}</NavLink>
      <NavLink to="/coop">{t("nav.coop")}</NavLink>
      {isFarm ? <NavLink to="/farm">{t("nav.farm")}</NavLink> : null}
    </nav>
  );
}

/** Two-state EN | ไทย switch. */
function LanguageToggle() {
  const { lang, setLang } = useLang();
  const t = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t("lang.label")}>
      {(["en", "th"] as const).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {t(l === "en" ? "lang.en" : "lang.th")}
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const t = useT();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="shell">
      <a className="skip" href="#main">{t("nav.skip")}</a>
      <header className="topbar">
        <Brand />
        <Nav className="nav-top" label={t("nav.main")} />
        <div className="topbar-right">
          <LanguageToggle />
          <NetworkBadge />
          <WalletButton />
        </div>
      </header>
      {deployment ? null : (
        <div className="banner" role="status">
          {t("layout.notDeployed", { network: networkLabel })}
        </div>
      )}
      <main id="main" className="page" key={location.pathname}>
        <Outlet />
      </main>
      <Footer />
      <Nav className="nav-bottom" label={t("nav.mainMobile")} />
    </div>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer className="footer">
      <p className="disclaimer">
        {t("footer.disclaimer")}
      </p>
      <div className="footer-links">
        <a href={GITHUB} target="_blank" rel="noreferrer">{t("footer.source")}</a>
        {deployment ? (
          <>
            <a className="mono small" href={`${EXPLORER}/address/${deployment.kai}`} target="_blank" rel="noreferrer">Kai {shortHex(deployment.kai)}</a>
            <a className="mono small" href={`${EXPLORER}/address/${deployment.khai}`} target="_blank" rel="noreferrer">Khai {shortHex(deployment.khai)}</a>
            <a className="mono small" href={`${EXPLORER}/address/${deployment.renderer}`} target="_blank" rel="noreferrer">Renderer {shortHex(deployment.renderer)}</a>
          </>
        ) : (
          <span className="muted small">{t("footer.noAddresses")}</span>
        )}
      </div>
    </footer>
  );
}
