import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";
import { formatEther, getAddress, parseEther, zeroAddress, type Address } from "viem";
import {
  LOCAL_CHAIN_ID,
  deploymentPath,
  requireAllowedChain,
  waitForPendingNonce,
  waitTx,
  type Deployment,
} from "./lib/common";

// Testnet parameters (SPEC section 6).
const PRICE = parseEther("0.001");
const CARE_FEE = parseEther("0.001");
const DAILY_LIMIT = 20n;
const DEFAULT_CARE_PERIOD = 3600n;

/**
 * Deploys KaiRenderer, Khai and Kai and wires them. The deployments file is written after every step,
 * so a crashed run resumes: addresses already recorded (and holding code) are reused.
 * REDEPLOY=1 moves an existing file to <chainId>.<timestamp>.json and starts fresh.
 */
async function main() {
  const chainId = await requireAllowedChain();
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY in the repo root .env.");
  const me = deployer.account.address;
  const out = deploymentPath(chainId);
  const rel = path.relative(process.cwd(), out);

  if (fs.existsSync(out) && process.env.REDEPLOY === "1") {
    const backup = out.replace(/\.json$/, `.${Date.now()}.json`);
    fs.renameSync(out, backup);
    console.log(`Moved the previous deployment to ${path.relative(process.cwd(), backup)}`);
  }

  // CARE_PERIOD override is only honoured on a local node.
  const carePeriod =
    chainId === LOCAL_CHAIN_ID && process.env.CARE_PERIOD ? BigInt(process.env.CARE_PERIOD) : DEFAULT_CARE_PERIOD;

  let d: Deployment;
  if (fs.existsSync(out)) {
    d = JSON.parse(fs.readFileSync(out, "utf8"));
    // A recorded address only counts if it holds code on this chain (a fresh local node has none).
    // Kai takes the other two addresses in its constructor, so it is redeployed whenever either of them is.
    const hasCode = async (a: Address | undefined) => !!a && !!(await publicClient.getCode({ address: a }))?.length;
    const findDropped = async () => {
      const missing = {
        KaiRenderer: !(await hasCode(d.contracts.KaiRenderer)),
        Khai: !(await hasCode(d.contracts.Khai)),
        Kai: !(await hasCode(d.contracts.Kai)),
      };
      missing.Kai = missing.Kai || missing.KaiRenderer || missing.Khai;
      return (Object.keys(missing) as (keyof typeof missing)[]).filter((k) => missing[k] && d.contracts[k]);
    };
    let dropped = await findDropped();
    if (dropped.length && d.status === "complete" && chainId !== LOCAL_CHAIN_ID) {
      // One RPC answering "no code" must never trigger a redeploy on a real network: ask again, then require REDEPLOY=1.
      await new Promise((r) => setTimeout(r, 3000));
      dropped = await findDropped();
      if (dropped.length) {
        throw new Error(
          `${rel} is complete but ${dropped.join(", ")} has no code on chain ${chainId} (checked twice). ` +
            "Check the RPC first; to deploy a fresh set on purpose, run again with REDEPLOY=1.",
        );
      }
    }
    if (d.status === "complete" && !dropped.length) {
      console.log(`${rel} is complete; nothing to do. Set REDEPLOY=1 to deploy a fresh set.`);
      return;
    }
    if (getAddress(d.deployer) !== getAddress(me)) throw new Error(`${rel} was started by another deployer`);
    if (dropped.length) {
      for (const k of dropped) delete d.contracts[k];
      d.status = "partial";
      d.blockNumber = 0;
      console.log(`No contract code on this chain for ${dropped.join(", ")}; deploying again.`);
    }
    console.log(`Resuming the deployment in ${rel}`);
  } else {
    d = {
      chainId,
      status: "partial",
      deployer: me,
      blockNumber: 0,
      deployedAt: new Date().toISOString(),
      contracts: {} as Deployment["contracts"],
      parameters: {
        admin: me,
        farm: me,
        price: PRICE.toString(),
        dailyLimit: DAILY_LIMIT.toString(),
        careFee: CARE_FEE.toString(),
        carePeriod: carePeriod.toString(),
        hatchDelayBlocks: 2,
      },
      gas: {},
    };
  }
  const p = d.parameters;
  const save = () => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(d, null, 2) + "\n");
  };

  console.log(`Deploying to chain ${chainId} from ${me} (balance ${formatEther(await publicClient.getBalance({ address: me }))})`);
  await waitForPendingNonce(me);

  const deploy = async (name: keyof Deployment["contracts"], args: unknown[]) => {
    const existing = d.contracts[name];
    if (existing && (await publicClient.getCode({ address: existing }))?.length) {
      console.log(`  ${name} ${existing} (reused)`);
      return existing;
    }
    const { contract, deploymentTransaction } = await hre.viem.sendDeploymentTransaction(name as string, args);
    const receipt = await waitTx(deploymentTransaction.hash);
    d.contracts[name] = contract.address;
    d.gas[`deploy ${name}`] = receipt.gasUsed.toString();
    if (!d.blockNumber) d.blockNumber = Number(receipt.blockNumber);
    save();
    console.log(`  ${name} ${contract.address} (gas ${receipt.gasUsed})`);
    return contract.address as Address;
  };

  const renderer = await deploy("KaiRenderer", []);
  const khai = await deploy("Khai", [p.admin, p.farm, BigInt(p.price), BigInt(p.dailyLimit)]);
  const kai = await deploy("Kai", [p.admin, p.farm, khai, renderer, BigInt(p.careFee), BigInt(p.carePeriod)]);

  const khaiAt = await hre.viem.getContractAt("Khai", khai);
  const wired = getAddress(await khaiAt.read.kai());
  if (wired !== zeroAddress && wired !== getAddress(kai)) {
    throw new Error(`Khai ${khai} is already wired to Kai ${wired}; set contracts.Kai to it in ${rel} or REDEPLOY=1`);
  }
  if (wired === getAddress(kai)) {
    console.log("  Khai.setKai already done");
  } else {
    const wire = await waitTx(await khaiAt.write.setKai([kai]));
    d.gas["Khai.setKai"] = wire.gasUsed.toString();
    console.log(`  Khai.setKai(${kai}) (gas ${wire.gasUsed})`);
  }

  d.status = "complete";
  save();
  const total = Object.values(d.gas).reduce((a, b) => a + BigInt(b), 0n);
  console.log(`Wrote ${rel}. Total gas ${total}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
