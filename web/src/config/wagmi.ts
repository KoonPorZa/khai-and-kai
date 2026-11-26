import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { TESTNET_RPCS, targetChain } from "./chains";
import { localWalletConnector } from "./localWallet";

const rpcs = targetChain.rpcUrls.default.http;
const transport = __LOCAL__
  ? http(rpcs[0])
  : fallback(TESTNET_RPCS.map((url) => http(url, { batch: true, retryCount: 1 })), { rank: false });


export const wagmiConfig = createConfig({
  chains: [targetChain],
  transports: { [targetChain.id]: transport },
  connectors: [injected(), ...(__LOCAL__ ? [localWalletConnector()] : [])],
  multiInjectedProviderDiscovery: true,
  batch: { multicall: true },
  pollingInterval: 1000,
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
