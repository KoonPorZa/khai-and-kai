import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";
import { formatEther, parseEther } from "viem";
import { LOCAL_CHAIN_ID, deploymentPath, requireAllowedChain, waitTx, type Deployment } from "./lib/common";

// Testnet parameters (SPEC section 6).
const PRICE = parseEther("0.01");
const CARE_FEE = parseEther("0.001");
const DAILY_LIMIT = 3n;
const DEFAULT_CARE_PERIOD = 3600n;

async function main() {
  const chainId = await requireAllowedChain();
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY in the repo root .env.");
  const me = deployer.account.address;
  const out = deploymentPath(chainId);
  if (fs.existsSync(out) && process.env.REDEPLOY !== "1") {
    throw new Error(`${path.relative(process.cwd(), out)} exists. Set REDEPLOY=1 to deploy a fresh set.`);
  }

  // CARE_PERIOD override is only honoured on a local node.
  const carePeriod =
    chainId === LOCAL_CHAIN_ID && process.env.CARE_PERIOD ? BigInt(process.env.CARE_PERIOD) : DEFAULT_CARE_PERIOD;

  console.log(`Deploying to chain ${chainId} from ${me} (balance ${formatEther(await publicClient.getBalance({ address: me }))})`);
  const gas: Record<string, bigint> = {};

  const deploy = async (name: string, args: unknown[]) => {
    const { contract, deploymentTransaction } = await hre.viem.sendDeploymentTransaction(name, args);
    const receipt = await waitTx(deploymentTransaction.hash);
    gas[`deploy ${name}`] = receipt.gasUsed;
    console.log(`  ${name} ${contract.address} (gas ${receipt.gasUsed})`);
    return { contract, receipt };
  };

  const renderer = await deploy("KaiRenderer", []);
  const khai = await deploy("Khai", [me, me, PRICE, DAILY_LIMIT]);
  const kai = await deploy("Kai", [me, me, khai.contract.address, renderer.contract.address, CARE_FEE, carePeriod]);

  const khaiAt = await hre.viem.getContractAt("Khai", khai.contract.address);
  const wire = await waitTx(await khaiAt.write.setKai([kai.contract.address]));
  gas["Khai.setKai"] = wire.gasUsed;
  console.log(`  Khai.setKai(${kai.contract.address}) (gas ${wire.gasUsed})`);

  const deployment: Deployment = {
    chainId,
    deployer: me,
    blockNumber: Number(renderer.receipt.blockNumber),
    deployedAt: new Date().toISOString(),
    contracts: { Khai: khai.contract.address, Kai: kai.contract.address, KaiRenderer: renderer.contract.address },
    parameters: {
      admin: me,
      farm: me,
      price: PRICE.toString(),
      dailyLimit: DAILY_LIMIT.toString(),
      careFee: CARE_FEE.toString(),
      carePeriod: carePeriod.toString(),
      hatchDelayBlocks: 2,
    },
    gas: Object.fromEntries(Object.entries(gas).map(([k, v]) => [k, v.toString()])),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(deployment, null, 2) + "\n");
  const total = Object.values(gas).reduce((a, b) => a + b, 0n);
  console.log(`Wrote ${path.relative(process.cwd(), out)}. Total gas ${total}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
