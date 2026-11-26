import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { deployment, EXPLORER, GITHUB, networkLabel } from "../config/chains";
import { useFarmRole } from "../hooks/useChain";
import { shortHex } from "../lib/format";
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
  return (
    <nav className={className} aria-label={label}>
      <NavLink to="/" end>Home</NavLink>
      <NavLink to="/eggs">Eggs</NavLink>
      <NavLink to="/coop">My coop</NavLink>
      {isFarm ? <NavLink to="/farm">Farm</NavLink> : null}
    </nav>
  );
}

export function Layout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <Brand />
        <Nav className="nav-top" label="Main" />
        <div className="topbar-right">
          <NetworkBadge />
          <WalletButton />
        </div>
      </header>
      {deployment ? null : (
        <div className="banner" role="status">
          Contracts are not deployed on {networkLabel} yet. You can look around, but actions are disabled.
        </div>
      )}
      <main id="main" className="page" key={location.pathname}>
        <Outlet />
      </main>
      <Footer />
      <Nav className="nav-bottom" label="Main, mobile" />
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <p className="disclaimer">
        Testnet demo on BNB Smart Chain (chain 97). The 300 birds are sample data. Sponsorship is not legal ownership of an animal.
      </p>
      <div className="footer-links">
        <a href={GITHUB} target="_blank" rel="noreferrer">Source on GitHub</a>
        {deployment ? (
          <>
            <a className="mono small" href={`${EXPLORER}/address/${deployment.kai}`} target="_blank" rel="noreferrer">Kai {shortHex(deployment.kai)}</a>
            <a className="mono small" href={`${EXPLORER}/address/${deployment.khai}`} target="_blank" rel="noreferrer">Khai {shortHex(deployment.khai)}</a>
            <a className="mono small" href={`${EXPLORER}/address/${deployment.renderer}`} target="_blank" rel="noreferrer">Renderer {shortHex(deployment.renderer)}</a>
          </>
        ) : (
          <span className="muted small">Contract addresses appear here after the testnet deploy.</span>
        )}
      </div>
    </footer>
  );
}
