import type { Config } from "wagmi";
import { connect } from "wagmi/actions";
import { mock } from "wagmi/connectors";

const HARDHAT_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const HARDHAT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/** `?as=farm` picks the deployer account (the farm role on a local deploy); anything else picks Hardhat account #1. */
const wantsFarm = () => new URLSearchParams(window.location.search).get("as") === "farm";

/**
 * Development only. The accounts are unlocked on the local Hardhat node, so the node signs;
 * no private key is needed in the app. Only ever called when __LOCAL__ is true.
 */
export function localWalletConnector() {
  return mock({
    accounts: [wantsFarm() ? HARDHAT_0 : HARDHAT_1],
    features: { reconnect: true },
  });
}

/** Development only: `?as=local` or `?as=farm` connects the local test wallet on load, so screens can be captured without clicking. */
export async function autoConnectLocal(config: Config) {
  const as = new URLSearchParams(window.location.search).get("as");
  if (as !== "local" && as !== "farm") return;
  const connector = config.connectors.find((c) => c.id === "mock");
  if (!connector) return;
  await connect(config, { connector });
  console.info("Local test wallet connected via ?as=local");
}
