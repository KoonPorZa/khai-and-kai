import hre from "hardhat";
import { contracts, requireAllowedChain, waitForPendingNonce, waitTx } from "./lib/common";
import { SAMPLE_BIRD_COUNT, sampleBirds } from "../lib/sampleBirds";

const BATCH = 50;

async function main() {
  const chainId = await requireAllowedChain();
  const { kai } = await contracts(chainId);
  const birds = sampleBirds(SAMPLE_BIRD_COUNT);
  // A crashed run may have left a batch in flight; read the count only after it confirms.
  const [wallet] = await hre.viem.getWalletClients();
  await waitForPendingNonce(wallet.account.address);
  const registered = Number(await kai.read.birdsRegistered());
  if (registered >= birds.length) {
    console.log(`Already ${registered} birds registered on chain ${chainId}; nothing to do.`);
    return;
  }
  if (registered > 0) console.log(`${registered} birds already registered; continuing from bird ${registered + 1}.`);
  let totalGas = 0n;
  for (let i = registered; i < birds.length; i += BATCH) {
    const batch = birds.slice(i, i + BATCH);
    const receipt = await waitTx(await kai.write.registerBirds([batch]));
    totalGas += receipt.gasUsed;
    console.log(`  birds ${i + 1}-${i + batch.length} registered (gas ${receipt.gasUsed})`);
  }
  console.log(`Done: ${await kai.read.birdsRegistered()} birds, pool ${await kai.read.poolSize()}. Seeding gas ${totalGas}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
