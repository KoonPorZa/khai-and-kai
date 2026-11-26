import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAccount, useBalance, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { formatNative, shortHex } from "../lib/format";
import { friendlyError } from "../lib/errors";
import { useT } from "../i18n";
import { nativeSymbol, networkLabel, targetChain, FAUCET } from "../config/chains";
import { useToast } from "./Toast";

type ModalApi = { open: () => void };
const ModalContext = createContext<ModalApi>({ open: () => undefined });
export const useConnectModal = () => useContext(ModalContext);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const api = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <ModalContext.Provider value={api}>
      {children}
      <ConnectDialog open={open} onClose={() => setOpen(false)} />
    </ModalContext.Provider>
  );
}

function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const connectors = useConnectors();
  const { connectAsync, isPending, variables } = useConnect();
  const toast = useToast();
  const t = useT();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Detected EIP-6963 wallets first. The generic injected entry is only offered when none are detected.
  const detected = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const generic = connectors.filter((c) => c.id === "injected");
  const local = __LOCAL__ ? connectors.filter((c) => c.id === "mock") : [];
  // A generic injected connector is only worth offering when the page really has a provider.
  const hasInjected = typeof window !== "undefined" && "ethereum" in window && !!(window as { ethereum?: unknown }).ethereum;
  const list = [...(detected.length > 0 ? detected : hasInjected ? generic : []), ...local];

  const pick = async (id: string) => {
    const connector = connectors.find((c) => c.uid === id);
    if (!connector) return;
    try {
      await connectAsync({ connector, chainId: targetChain.id });
      onClose();
    } catch (e) {
      const f = friendlyError(e);
      toast(f.kind === "rejected" ? "info" : "error", f.title, f.detail);
    }
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="connect-title">
      <div className="dialog-card">
        <div className="dialog-head">
          <h2 id="connect-title">{t("wallet.connectTitle")}</h2>
          <button type="button" className="icon-btn" aria-label={t("wallet.close")} onClick={onClose}>
            &times;
          </button>
        </div>
        <p className="muted small">{t("wallet.intro")}</p>
        {list.length === 0 ? (
          <div className="notice wallet-help">
            <strong>{t("wallet.noneTitle")}</strong>
            <span>
              {t("wallet.noneDesktopBefore")}<a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a>{t("wallet.noneDesktopAfter")}
            </span>
            <span>{t("wallet.nonePhone")}</span>
            <span>{t("wallet.noneReadOnly")}</span>
          </div>
        ) : (
          <ul className="wallet-list">
            {list.map((c) => (
              <li key={c.uid}>
                <button type="button" className="wallet-option" disabled={isPending} onClick={() => pick(c.uid)}>
                  {c.icon ? <img src={c.icon} alt="" width={28} height={28} /> : <span className="wallet-fallback" aria-hidden="true" />}
                  <span>{__LOCAL__ && c.id === "mock" ? "Local test wallet" : c.id === "injected" ? t("wallet.browserWallet") : c.name}</span>
                  {isPending && variables?.connector && "uid" in variables.connector && variables.connector.uid === c.uid ? <span className="muted small">{t("wallet.checkWallet")}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          {t("wallet.faucetBefore")}<a href={FAUCET} target="_blank" rel="noreferrer">{t("wallet.faucetLink")}</a>{t("wallet.faucetAfter")}
        </p>
      </div>
    </dialog>
  );
}

export function useWalletState() {
  const { address, isConnected, chainId } = useAccount();
  const wrongNetwork = isConnected && chainId !== targetChain.id;
  return { address, isConnected, wrongNetwork };
}

export function NetworkBadge() {
  const t = useT();
  const { isConnected, wrongNetwork } = useWalletState();
  const ok = !wrongNetwork;
  return (
    <span className="net-badge" title={isConnected && wrongNetwork ? t("wallet.otherNetwork") : networkLabel}>
      <span className={`dot ${ok ? "dot-ok" : "dot-bad"}`} aria-hidden="true" />
      {wrongNetwork ? t("wallet.wrongNetwork") : networkLabel}
    </span>
  );
}

export function WalletButton() {
  const { address, isConnected, wrongNetwork } = useWalletState();
  const modal = useConnectModal();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending } = useSwitchChain();
  const toast = useToast();
  const t = useT();
  const balance = useBalance({ address, chainId: targetChain.id, query: { enabled: !!address, refetchInterval: 10_000 } });
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setMenu(false);
      } else if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const switchNow = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: targetChain.id });
    } catch (e) {
      const f = friendlyError(e);
      toast("error", f.kind === "rejected" ? t("wallet.switchCancelled") : t("wallet.switchFailed"), f.detail);
    }
  }, [switchChainAsync, toast, t]);

  if (!isConnected || !address) {
    return (
      <button type="button" className="btn btn-outline" onClick={modal.open}>
        {t("wallet.connect")}
      </button>
    );
  }
  return (
    <div className="wallet-wrap" ref={wrap}>
      {wrongNetwork ? (
        <button type="button" className="btn btn-coral" onClick={switchNow} disabled={isPending}>
          {t("wallet.switchTo", { network: networkLabel })}
        </button>
      ) : null}
      <button type="button" className="pill mono" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
        {shortHex(address)}
      </button>
      {menu ? (
        <div className="menu" role="menu">
          <div className="menu-row">
            <span className="muted small">{t("wallet.balance")}</span>
            <span className="mono">{balance.data ? `${formatNative(balance.data.value)} ${nativeSymbol}` : "…"}</span>
          </div>
          <div className="menu-row">
            <span className="muted small">{t("wallet.address")}</span>
            <span className="mono small">{shortHex(address, 8, 6)}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              disconnect();
              setMenu(false);
            }}
          >
            {t("wallet.disconnect")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A primary action that first asks for a wallet, then for the right network. */
export function ActionButton({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "outline" | "coral";
  className?: string;
  type?: "button" | "submit";
}) {
  const { isConnected, wrongNetwork } = useWalletState();
  const modal = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const toast = useToast();
  const t = useT();
  const cls = `btn btn-${variant} ${className}`;
  if (!isConnected) {
    return (
      <button type="button" className={cls} onClick={modal.open}>
        {t("wallet.connect")}
      </button>
    );
  }
  if (wrongNetwork) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() =>
          switchChainAsync({ chainId: targetChain.id }).catch((e) => {
            const f = friendlyError(e);
            toast("error", t("wallet.switchFailed"), f.detail);
          })
        }
      >
        {t("wallet.switchTo", { network: networkLabel })}
      </button>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      {children}
    </button>
  );
}
