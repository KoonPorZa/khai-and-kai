import { bscTestnet } from "viem/chains";
import { defineChain, type Address } from "viem";
import deploymentsJson from "../abi/deployments.json";

export const TESTNET_ID = 97;

const localChain = __LOCAL__
  ? defineChain({
      id: 31337,
      name: "Local Hardhat",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
      // No multicall3 contract: a fresh Hardhat node does not have one, so reads go out one by one.
    })
  : undefined;

// The local dev chain is typed as the testnet chain so wagmi sees one concrete chain type; ids are read at runtime.
export const targetChain = (localChain ?? bscTestnet) as unknown as typeof bscTestnet;
export const nativeSymbol = localChain ? "ETH" : "tBNB";
export const networkLabel = localChain ? "Local test node" : "BNB testnet";

export const TESTNET_RPCS = [
  "https://bsc-testnet-dataseed.bnbchain.org",
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
];

export const EXPLORER = "https://testnet.bscscan.com";
export const GITHUB = "https://github.com/KoonPorZa/khai-and-kai";
export const FAUCET = "https://www.bnbchain.org/en/testnet-faucet";

export type Deployment = { khai: Address; kai: Address; renderer: Address };

type RawDeployment = { contracts: { Khai: Address; Kai: Address; KaiRenderer: Address } };

export function deploymentFor(chainId: number): Deployment | undefined {
  const raw = (deploymentsJson as Record<string, RawDeployment | undefined>)[String(chainId)];
  if (!raw) return undefined;
  return { khai: raw.contracts.Khai, kai: raw.contracts.Kai, renderer: raw.contracts.KaiRenderer };
}

export const deployment = deploymentFor(targetChain.id);

if (!__LOCAL__ && targetChain.id !== TESTNET_ID) {
  throw new Error("Production builds only support BNB testnet (97).");
}
