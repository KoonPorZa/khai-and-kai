import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";
import { readDeployment, requireAllowedChain } from "./lib/common";

const SERVER = "https://sourcify.dev/server";
const HEADERS = { "content-type": "application/json", "user-agent": "khai-and-kai-verify/0.1" };

/**
 * Verifies the deployed contracts on Sourcify with its v2 API (no API key).
 * Sends the Hardhat build-info standard JSON input; Sourcify recompiles and
 * matches the on-chain bytecode, so constructor arguments are not needed.
 */
async function main() {
  const chainId = await requireAllowedChain();
  const d = readDeployment(chainId);
  const jobs: [string, string, string][] = [
    ["contracts/KaiRenderer.sol", "KaiRenderer", d.contracts.KaiRenderer],
    ["contracts/Khai.sol", "Khai", d.contracts.Khai],
    ["contracts/Kai.sol", "Kai", d.contracts.Kai],
  ];

  let failed = false;
  for (const [source, name, address] of jobs) {
    const fqn = `${source}:${name}`;
    const buildInfo = await hre.artifacts.getBuildInfo(fqn);
    if (!buildInfo) throw new Error(`No build info for ${fqn}; run the build first`);

    const existing = await fetch(`${SERVER}/v2/contract/${chainId}/${address}`, { headers: HEADERS });
    if (existing.ok) {
      const body = (await existing.json()) as { match?: string | null };
      if (body.match) {
        console.log(`${name} ${address}: already verified (${body.match})`);
        continue;
      }
    }

    const res = await fetch(`${SERVER}/v2/verify/${chainId}/${address}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        stdJsonInput: buildInfo.input,
        compilerVersion: buildInfo.solcLongVersion,
        contractIdentifier: fqn,
      }),
    });
    const submitted = (await res.json()) as { verificationId?: string; message?: string };
    if (!res.ok || !submitted.verificationId) {
      console.error(`${name} ${address}: submit failed (${res.status}) ${submitted.message ?? ""}`);
      failed = true;
      continue;
    }

    let outcome = "timed out waiting for Sourcify";
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(`${SERVER}/v2/verify/${submitted.verificationId}`, { headers: HEADERS });
      const job = (await poll.json()) as {
        isJobCompleted?: boolean;
        contract?: { match?: string | null };
        error?: { message?: string };
      };
      if (!job.isJobCompleted) continue;
      outcome = job.contract?.match ? `verified (${job.contract.match})` : `failed: ${job.error?.message ?? "no match"}`;
      if (!job.contract?.match) failed = true;
      break;
    }
    if (outcome.startsWith("timed out")) failed = true;
    console.log(`${name} ${address}: ${outcome}`);
  }

  const out = path.join(__dirname, "..", "deployments", `${chainId}.sourcify.txt`);
  fs.writeFileSync(out, jobs.map(([, n, a]) => `${n} https://repo.sourcify.dev/${chainId}/${a}`).join("\n") + "\n");
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
