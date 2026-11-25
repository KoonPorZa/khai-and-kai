import { encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * Recomputes a Kai hatch draw off-chain. Pure: no RPC calls, only viem hashing.
 *
 * Seed rule (Kai.finishHatch):
 * - normal:   keccak256(abi.encode(bytes32 blockhash(revealBlock), uint256 hatchId))
 * - fallback: keccak256(abi.encode(uint256 hatchId, uint256 revealBlock))  (block hash older than 256 blocks)
 * Draw: index = uint256(seed) % poolSizeAtFinish.
 *
 * Inputs come from views: Kai.hatch(hatchId) gives revealBlock and usedFallback, Kai.hatchProof(hatchId)
 * gives the on-chain seed, poolSizeAtFinish and index, and the block hash comes from getBlock(revealBlock).
 */
export type HatchInput = {
  hatchId: bigint;
  revealBlock: bigint;
  usedFallback: boolean;
  /** Required unless usedFallback is true. */
  revealBlockHash?: Hex;
  poolSizeAtFinish: bigint;
};

export function computeHatchSeed(input: Omit<HatchInput, "poolSizeAtFinish">): Hex {
  if (input.usedFallback) {
    return keccak256(
      encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [input.hatchId, input.revealBlock]),
    );
  }
  if (!input.revealBlockHash) throw new Error("revealBlockHash is required for a non-fallback hatch");
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [input.revealBlockHash, input.hatchId]),
  );
}

export function computeHatchIndex(seed: Hex, poolSizeAtFinish: bigint): bigint {
  if (poolSizeAtFinish === 0n) throw new Error("poolSizeAtFinish must be > 0");
  return BigInt(seed) % poolSizeAtFinish;
}

export type VerifyResult = { seed: Hex; index: bigint; seedMatches: boolean; indexMatches: boolean; ok: boolean };

/** Compares the recomputed seed and index with the on-chain values from Kai.hatchProof. */
export function verifyHatch(input: HatchInput, onChain: { seed: Hex; index: bigint }): VerifyResult {
  const seed = computeHatchSeed(input);
  const index = computeHatchIndex(seed, input.poolSizeAtFinish);
  const seedMatches = seed.toLowerCase() === onChain.seed.toLowerCase();
  const indexMatches = index === onChain.index;
  return { seed, index, seedMatches, indexMatches, ok: seedMatches && indexMatches };
}
