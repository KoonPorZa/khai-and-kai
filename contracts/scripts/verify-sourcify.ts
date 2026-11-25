import hre from "hardhat";
import { readDeployment, requireAllowedChain } from "./lib/common";

/** Verifies the deployed contracts on Sourcify (no API key). Etherscan is disabled in hardhat.config.ts. */
async function main() {
  const chainId = await requireAllowedChain();
  const d = readDeployment(chainId);
  const p = d.parameters;
  const jobs: [string, string, unknown[]][] = [
    ["contracts/KaiRenderer.sol:KaiRenderer", d.contracts.KaiRenderer, []],
    ["contracts/Khai.sol:Khai", d.contracts.Khai, [p.admin, p.farm, p.price, p.dailyLimit]],
    ["contracts/Kai.sol:Kai", d.contracts.Kai, [p.admin, p.farm, d.contracts.Khai, d.contracts.KaiRenderer, p.careFee, p.carePeriod]],
  ];
  for (const [contract, address, constructorArguments] of jobs) {
    console.log(`Verifying ${contract} at ${address}`);
    await hre.run("verify:verify", { address, constructorArguments, contract });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
