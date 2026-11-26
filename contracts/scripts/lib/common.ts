import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";
import type { Address } from "viem";

export const TESTNET_CHAIN_ID = 97;
export const LOCAL_CHAIN_ID = 31337;

/** Refuses every chain except BSC testnet (97), or a local Hardhat node (31337) when ALLOW_LOCAL=1. */
export async function requireAllowedChain(): Promise<number> {
  const publicClient = await hre.viem.getPublicClient();
  const chainId = await publicClient.getChainId();
  if (chainId === TESTNET_CHAIN_ID) return chainId;
  if (chainId === LOCAL_CHAIN_ID && process.env.ALLOW_LOCAL === "1") return chainId;
  throw new Error(
    `Refusing chain ${chainId}. Only BSC testnet (97) is allowed, or 31337 with ALLOW_LOCAL=1.`,
  );
}

export type Deployment = {
  chainId: number;
  /** "partial" while deploy.ts is still running (or crashed); rerunning resumes from it. */
  status: "partial" | "complete";
  deployer: Address;
  blockNumber: number;
  deployedAt: string;
  contracts: { Khai: Address; Kai: Address; KaiRenderer: Address };
  parameters: {
    admin: Address;
    farm: Address;
    price: string;
    dailyLimit: string;
    careFee: string;
    carePeriod: string;
    hatchDelayBlocks: number;
  };
  gas: Record<string, string>;
};

export function deploymentPath(chainId: number) {
  return path.join(__dirname, "..", "..", "deployments", `${chainId}.json`);
}

export function readDeployment(chainId: number): Deployment {
  const file = deploymentPath(chainId);
  if (!fs.existsSync(file)) throw new Error(`No deployment for chain ${chainId} at ${file}. Run deploy first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export async function contracts(chainId: number) {
  const d = readDeployment(chainId);
  if (d.status !== "complete") throw new Error(`Deployment for chain ${chainId} is partial. Rerun deploy to finish it.`);
  return {
    deployment: d,
    khai: await hre.viem.getContractAt("Khai", d.contracts.Khai),
    kai: await hre.viem.getContractAt("Kai", d.contracts.Kai),
  };
}

/** Sends a write and waits for its receipt; throws on revert. */
export async function waitTx(hash: `0x${string}`) {
  const publicClient = await hre.viem.getPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted`);
  return receipt;
}

/** Waits until the account has no pending transactions, so reads reflect every sent transaction. */
export async function waitForPendingNonce(address: Address) {
  const publicClient = await hre.viem.getPublicClient();
  for (let i = 0; i < 120; i++) {
    const [pending, latest] = await Promise.all([
      publicClient.getTransactionCount({ address, blockTag: "pending" }),
      publicClient.getTransactionCount({ address, blockTag: "latest" }),
    ]);
    if (pending === latest) return;
    console.log(`  waiting for ${pending - latest} pending transaction(s) from ${address}...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Pending transactions did not confirm within 4 minutes");
}
