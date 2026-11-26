// Integration test against a local Hardhat node (chain 31337). It starts and stops its own node, deploys the contracts from
// the compiled artifacts, seeds sample birds, then walks through the flows the web app performs, using the app's own ABIs
// and lib functions (error messages, receipt parsing, draw check, hashing, art). No browser involved.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  getAddress,
  http,
  parseEther,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { hardhat } from "viem/chains";
import { kaiAbi } from "../src/abi/kai";
import { khaiAbi } from "../src/abi/khai";
import deployments from "../src/abi/deployments.json";
import { composeChicken } from "../src/lib/composeArt";
import { decodeTokenUri } from "../src/lib/chickenArt";
import { friendlyError } from "../src/lib/errors";
import { recordHash } from "../src/lib/hash";
import { hatchIdFromReceipt } from "../src/lib/receipt";
import { verifyHatch } from "../src/lib/verifyHatch";
import { bandId } from "../src/lib/format";
import { sampleBirds } from "../../contracts/lib/sampleBirds";

const CONTRACTS = join(__dirname, "..", "..", "contracts");
const RPC = "http://127.0.0.1:8545";
const CARE_PERIOD = 60n;
const PRICE = parseEther("0.01");
const CARE_FEE = parseEther("0.001");
const BIRDS = 120;

let node: ChildProcess | undefined;
let pub: PublicClient;
const test = createTestClient({ chain: hardhat, mode: "hardhat", transport: http(RPC) });
let accounts: Address[] = [];
let khai: Address;
let kai: Address;

const wallet = (account: Address): WalletClient => createWalletClient({ account, chain: hardhat, transport: http(RPC) });
const rpc = async (method: string, params: unknown[] = []) => {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await res.json()) as { result?: unknown; error?: unknown };
};

type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };

/** What the app's useTx does: simulate (so reverts carry their error name), send, wait for the receipt. */
async function send(from: Address, call: Call) {
  const { request } = await pub.simulateContract({ ...call, account: from } as never);
  const hash = await wallet(from).writeContract(request as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return receipt;
}
const khaiCall = (functionName: string, args?: readonly unknown[], value?: bigint): Call => ({ address: khai, abi: khaiAbi as Abi, functionName, args, value });
const kaiCall = (functionName: string, args?: readonly unknown[], value?: bigint): Call => ({ address: kai, abi: kaiAbi as Abi, functionName, args, value });

const readKai = (functionName: string, args: readonly unknown[] = []) =>
  pub.readContract({ address: kai, abi: kaiAbi as Abi, functionName, args } as never) as Promise<never>;
const readKhai = (functionName: string, args: readonly unknown[] = []) =>
  pub.readContract({ address: khai, abi: khaiAbi as Abi, functionName, args } as never) as Promise<never>;

async function mineUntilAfter(block: bigint) {
  while ((await pub.getBlockNumber({ cacheTime: 0 })) <= block) await rpc("evm_mine");
}

async function startHatch(who: Address): Promise<bigint> {
  const receipt = await send(who, khaiCall("buyAndStartHatch", [], PRICE));
  const id = hatchIdFromReceipt(receipt);
  expect(id).toBeDefined();
  return id!;
}

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const dir = join(CONTRACTS, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  return JSON.parse(readFileSync(dir, "utf8"));
}

async function waitForRpc() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await rpc("eth_chainId")).result === "0x7a69") return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The local Hardhat node did not start.");
}

beforeAll(async () => {
  if (!existsSync(join(CONTRACTS, "artifacts", "contracts", "Kai.sol", "Kai.json"))) {
    execFileSync("pnpm", ["--filter", "contracts", "build"], { cwd: CONTRACTS, stdio: "pipe" });
  }
  node = spawn("pnpm", ["--filter", "contracts", "node"], { cwd: CONTRACTS, env: { ...process.env, ALLOW_LOCAL: "1" }, stdio: "ignore", detached: true });
  await waitForRpc();
  pub = createPublicClient({ chain: hardhat, transport: http(RPC) });
  accounts = ((await rpc("eth_accounts")).result as string[]).map((a) => getAddress(a));

  // Same order and arguments as contracts/scripts/deploy.ts, with a 60 s care period so overdue can be tested quickly.
  const [deployer] = accounts as [Address];
  const deploy = async (name: string, args: unknown[]) => {
    const { abi, bytecode } = artifact(name);
    const hash = await wallet(deployer).deployContract({ abi, bytecode, args } as never);
    return (await pub.waitForTransactionReceipt({ hash })).contractAddress as Address;
  };
  const renderer = await deploy("KaiRenderer", []);
  khai = await deploy("Khai", [deployer, deployer, PRICE, 3n]);
  kai = await deploy("Kai", [deployer, deployer, khai, renderer, CARE_FEE, CARE_PERIOD]);
  await send(deployer, khaiCall("setKai", [kai]));
  for (let i = 0; i < BIRDS; i += 60) {
    await send(deployer, kaiCall("registerBirds", [sampleBirds(BIRDS).slice(i, i + 60)]));
  }
}, 180_000);

afterAll(async () => {
  if (node?.pid) {
    try {
      process.kill(-node.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  for (let i = 0; i < 20; i++) {
    try {
      await rpc("eth_chainId");
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}, 20_000);

describe("local chain", () => {
  it("deploys to the addresses recorded in deployments.json and registers the birds", async () => {
    const recorded = (deployments as Record<string, { contracts: { Khai: string; Kai: string } }>)["31337"];
    if (recorded) {
      expect(getAddress(khai)).toBe(getAddress(recorded.contracts.Khai));
      expect(getAddress(kai)).toBe(getAddress(recorded.contracts.Kai));
    }
    const stats = (await readKai("stats")) as { birdsRegistered: bigint; poolSize: bigint };
    expect(stats.birdsRegistered).toBe(BigInt(BIRDS));
    expect(stats.poolSize).toBe(BigInt(BIRDS));
    expect(await readKai("carePeriod")).toBe(CARE_PERIOD);
    expect(await readKai("MAX_CARE_PERIODS")).toBe(8760n);
  });

  let alice: Address;
  let bob: Address;
  let carol: Address;
  let aliceHatch: bigint;
  let aliceToken: bigint;

  it("buys and hatches end to end: two confirmations, the chicken appears with its on-chain art", async () => {
    [, alice, bob, carol] = accounts as [Address, Address, Address, Address];
    aliceHatch = await startHatch(alice);
    const hatch = (await readKai("hatch", [aliceHatch])) as { owner: Address; revealBlock: bigint; birdId: number };
    expect(getAddress(hatch.owner)).toBe(getAddress(alice));
    expect(hatch.birdId).toBe(0);
    expect(await readKai("hatchesOf", [alice])).toEqual([aliceHatch]);

    // Too early: the app waits for block.number > revealBlock before the second confirmation.
    await expect(pub.simulateContract({ ...kaiCall("finishHatch", [aliceHatch]), account: alice } as never)).rejects.toSatisfy((e) => friendlyError(e).title.includes("reveal block"));
    await mineUntilAfter(hatch.revealBlock);
    const receipt = await send(alice, kaiCall("finishHatch", [aliceHatch]));
    expect(receipt.gasUsed).toBeLessThan(1_500_000n);

    const done = (await readKai("hatch", [aliceHatch])) as { birdId: number; usedFallback: boolean };
    expect(done.birdId).toBeGreaterThan(0);
    expect(done.usedFallback).toBe(false);
    aliceToken = BigInt(done.birdId);

    const chicken = (await readKai("chicken", [aliceToken])) as { owner: Address; bird: { breed: number; sex: number; plumage: number }; hatchId: bigint };
    expect(getAddress(chicken.owner)).toBe(getAddress(alice));
    expect(chicken.hatchId).toBe(aliceHatch);
    expect((await readKai("chickensOf", [alice])) as unknown[]).toHaveLength(1);
    expect(await readKai("tokenByIndex", [0n])).toBe(aliceToken);

    // The token art from tokenURI is exactly what the app draws from the traits.
    const meta = decodeTokenUri((await readKai("tokenURI", [aliceToken])) as string);
    const svg = Buffer.from(meta!.image!.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
    expect(svg).toBe(composeChicken({ breed: chicken.bird.breed, sex: chicken.bird.sex, plumage: chicken.bird.plumage, tokenId: aliceToken }));
    expect(bandId(aliceToken)).toMatch(/^KK-\d{4}$/);
  });

  it("recomputes the draw in the same way as Check the draw and matches hatchProof", async () => {
    const hatch = (await readKai("hatch", [aliceHatch])) as { revealBlock: bigint; usedFallback: boolean };
    const [seed, poolSizeAtFinish, index] = (await readKai("hatchProof", [aliceHatch])) as unknown as [Hex, bigint, bigint];
    const block = await pub.getBlock({ blockNumber: hatch.revealBlock });
    const input = { hatchId: aliceHatch, revealBlock: hatch.revealBlock, usedFallback: hatch.usedFallback, revealBlockHash: block.hash as Hex, poolSizeAtFinish };
    const ok = verifyHatch(input, { seed, index });
    expect(ok.ok).toBe(true);
    expect(poolSizeAtFinish).toBe(BigInt(BIRDS));
    expect(verifyHatch({ ...input, revealBlockHash: `0x${"11".repeat(32)}` }, { seed, index }).ok).toBe(false);
  });

  it("rejects the 4th egg of the day with the mapped message", async () => {
    await send(carol, khaiCall("buy", [3n], PRICE * 3n));
    expect(await readKhai("remainingToday", [carol])).toBe(0n);
    for (const call of [khaiCall("buyAndStartHatch", [], PRICE), khaiCall("buy", [1n], PRICE)]) {
      const err = await pub.simulateContract({ ...call, account: carol } as never).then(
        () => undefined,
        (e: unknown) => friendlyError(e),
      );
      expect(err?.kind).toBe("contract");
      expect(err?.title).toContain("today's egg limit");
    }
    const wrong = await pub.simulateContract({ ...khaiCall("buy", [1n], PRICE - 1n), account: bob } as never).then(
      () => undefined,
      (e: unknown) => friendlyError(e),
    );
    expect(wrong?.title).toContain("does not match the price");
  });

  it("lets another account finish a pending hatch, and hatches kept eggs with startHatch", async () => {
    const id = await startHatch(bob);
    const hatch = (await readKai("hatch", [id])) as { revealBlock: bigint };
    await mineUntilAfter(hatch.revealBlock);
    await send(carol, kaiCall("finishHatch", [id])); // a stranger reveals it
    const chickens = (await readKai("chickensOf", [bob])) as { owner: Address }[];
    expect(chickens).toHaveLength(1);
    expect(getAddress(chickens[0]!.owner)).toBe(getAddress(bob));

    // Carol's three kept eggs: startHatch burns one and queues a hatch for her.
    expect(await readKhai("balanceOf", [carol, 1n])).toBe(3n);
    const receipt = await send(carol, kaiCall("startHatch"));
    expect(hatchIdFromReceipt(receipt)).toBeDefined();
    expect(await readKhai("balanceOf", [carol, 1n])).toBe(2n);
  });

  it("finishes a hatch left past 256 blocks with the fallback label, and the check still agrees", async () => {
    const [, , , , dave] = accounts as Address[];
    const id = await startHatch(dave!);
    const hatch = (await readKai("hatch", [id])) as { revealBlock: bigint };
    await test.mine({ blocks: 300 });
    await send(dave!, kaiCall("finishHatch", [id]));
    const done = (await readKai("hatch", [id])) as { usedFallback: boolean; revealBlock: bigint };
    expect(done.usedFallback).toBe(true);
    const [seed, poolSizeAtFinish, index] = (await readKai("hatchProof", [id])) as unknown as [Hex, bigint, bigint];
    expect(verifyHatch({ hatchId: id, revealBlock: hatch.revealBlock, usedFallback: true, poolSizeAtFinish }, { seed, index }).ok).toBe(true);
  });

  it("pays care, goes overdue after the care period, locks transfers, and unlocks them after paying", async () => {
    expect(await readKai("isOverdue", [aliceToken])).toBe(false);
    await rpc("evm_increaseTime", [Number(CARE_PERIOD) + 5]);
    await test.mine({ blocks: 1 });
    expect(await readKai("isOverdue", [aliceToken])).toBe(true);

    const blocked = await pub.simulateContract({ address: kai, abi: kaiAbi, functionName: "transferFrom", args: [alice, bob, aliceToken], account: alice }).then(
      () => undefined,
      (e: unknown) => friendlyError(e),
    );
    expect(blocked?.title).toContain("Care is overdue");

    await send(alice, kaiCall("payCare", [aliceToken, 1n], CARE_FEE));
    expect(await readKai("isOverdue", [aliceToken])).toBe(false);
    await send(alice, { address: kai, abi: kaiAbi as Abi, functionName: "transferFrom", args: [alice, bob, aliceToken] });
    expect(getAddress((await readKai("ownerOf", [aliceToken])) as Address)).toBe(getAddress(bob));

    const tooMany = await pub.simulateContract({ ...kaiCall("payCare", [aliceToken, 8761n], CARE_FEE * 8761n), account: bob } as never).then(
      () => undefined,
      (e: unknown) => friendlyError(e),
    );
    expect(tooMany?.kind).toBe("contract");
  });

  it("lets the farm post a proof, returns proofs newest first, and refuses other wallets", async () => {
    const farm = accounts[0]!;
    const first = "Weighed 1.9 kg at 07:10";
    const second = "Fed and checked the water";
    await send(farm, kaiCall("postCareProof", [aliceToken, 2, recordHash(first), "Weight check"]));
    await send(farm, kaiCall("postCareProof", [aliceToken, 0, recordHash(second), "Morning feeding"]));
    const proofs = (await readKai("careProofs", [aliceToken, 0n, 10n])) as { kind: number; contentHash: Hex; note: string }[];
    expect(proofs.map((p) => p.note)).toEqual(["Morning feeding", "Weight check"]);
    expect(proofs[0]!.contentHash).toBe(recordHash(second));
    expect(((await readKai("chicken", [aliceToken])) as { proofCount: bigint }).proofCount).toBe(2n);

    const stranger = await pub.simulateContract({ ...kaiCall("postCareProof", [aliceToken, 5, recordHash("x"), "n"]), account: bob } as never).then(
      () => undefined,
      (e: unknown) => friendlyError(e),
    );
    expect(stranger?.title).toContain("not the farm account");
    const role = (await readKai("FARM_ROLE")) as Hex;
    expect(await readKai("hasRole", [role, farm])).toBe(true);
    expect(await readKai("hasRole", [role, bob])).toBe(false);
    expect(zeroAddress).toBe("0x0000000000000000000000000000000000000000");
  });
});
