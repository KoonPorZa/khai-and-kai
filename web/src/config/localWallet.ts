import { mock } from "wagmi/connectors";

/**
 * Development only. Hardhat account #1 is unlocked on the local node, so the node signs;
 * no private key is needed in the app. Only ever called when __LOCAL__ is true.
 */
export function localWalletConnector() {
  return mock({
    accounts: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
    features: { reconnect: true },
  });
}
