import hre from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther, type Address } from "viem";

export const PRICE = parseEther("0.01");
export const CARE_FEE = parseEther("0.001");
export const CARE_PERIOD = 3600n;
export const DAILY_LIMIT = 3n;

export type BirdInput = { breed: number; sex: number; plumage: number; bornAt: number; recordHash: `0x${string}` };

export function makeBirds(n: number, start = 0): BirdInput[] {
  return Array.from({ length: n }, (_, i) => {
    const k = start + i;
    return {
      breed: k % 10,
      sex: k % 2,
      plumage: (k * 3) % 8,
      bornAt: 1_750_000_000 + k * 86_400,
      recordHash: `0x${(k + 1).toString(16).padStart(64, "0")}` as `0x${string}`,
    };
  });
}

export async function deploySystem(birdCount: number) {
  const [admin, farm, ...users] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const renderer = await hre.viem.deployContract("KaiRenderer", []);
  const khai = await hre.viem.deployContract("Khai", [admin.account.address, farm.account.address, PRICE, DAILY_LIMIT]);
  const kai = await hre.viem.deployContract("Kai", [
    admin.account.address,
    farm.account.address,
    khai.address,
    renderer.address,
    CARE_FEE,
    CARE_PERIOD,
  ]);
  await khai.write.setKai([kai.address]);
  const birds = makeBirds(birdCount);
  for (let i = 0; i < birds.length; i += 50) {
    await kai.write.registerBirds([birds.slice(i, i + 50)], { account: farm.account });
  }
  return { admin, farm, users, publicClient, renderer, khai, kai, birds };
}

export type System = Awaited<ReturnType<typeof deploySystem>>;

/** Mines enough blocks so the next transaction lands after revealBlock. */
export async function mineToReveal(sys: System, hatchId: bigint) {
  const h = await sys.kai.read.hatch([hatchId]);
  const now = await sys.publicClient.getBlockNumber();
  if (now < h.revealBlock) {
    await mine(Number(h.revealBlock - now));
  }
}

export async function assertI1(sys: System) {
  const supply = await sys.khai.read.totalSupply([1n]);
  const pending = await sys.kai.read.pendingHatches();
  const pool = await sys.kai.read.poolSize();
  if (supply + pending > pool) throw new Error(`I1 broken: supply ${supply} + pending ${pending} > pool ${pool}`);
  const available = await sys.khai.read.eggsAvailable();
  if (available !== pool - supply - pending) throw new Error("eggsAvailable mismatch");
}

export function addr(w: { account: { address: Address } }) {
  return w.account.address;
}

/** Minimal XML well-formedness check: balanced tags, single root <svg>. */
export function assertWellFormedSvg(svg: string) {
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) throw new Error("not an svg root");
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const between = svg.slice(last, m.index);
    if (between.includes("<") || between.includes(">")) throw new Error(`stray markup near ${m.index}: ${between}`);
    last = re.lastIndex;
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) {
      const open = stack.pop();
      if (open !== tag) throw new Error(`mismatched </${tag}> (open ${open})`);
    } else stack.push(tag);
  }
  if (svg.slice(last).length) throw new Error("trailing content");
  if (stack.length) throw new Error(`unclosed: ${stack.join(",")}`);
}

export function decodeDataUri(uri: string, prefix: string) {
  if (!uri.startsWith(prefix)) throw new Error(`expected ${prefix}`);
  return Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
}
