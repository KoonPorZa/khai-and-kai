import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, mine, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { encodeAbiParameters, getAddress, keccak256, zeroAddress, type Hex } from "viem";
import { verifyHatch, computeHatchSeed, computeHatchIndex } from "../lib/verifyHatch";
import { loadCompose } from "../scripts/gen-art";
import {
  CARE_FEE,
  CARE_PERIOD,
  DAILY_LIMIT,
  PRICE,
  addr,
  assertI1,
  assertWellFormedSvg,
  decodeDataUri,
  deploySystem,
  mineToReveal,
  type System,
} from "./helpers";

const EGG = 1n;
const bigPool = () => deploySystem(60);
const smallPool = () => deploySystem(3);

async function buyAndHatch(sys: System, user: System["users"][number]) {
  await sys.khai.write.buyAndStartHatch({ account: user.account, value: PRICE });
  return sys.kai.read.hatchCount();
}

async function hatchAndFinish(sys: System, user: System["users"][number]) {
  const hatchId = await buyAndHatch(sys, user);
  await mineToReveal(sys, hatchId);
  await sys.kai.write.finishHatch([hatchId]);
  const h = await sys.kai.read.hatch([hatchId]);
  return { hatchId, tokenId: BigInt(h.birdId) };
}

describe("Khai & Kai", () => {
  describe("deployment", () => {
    it("every contract is under the 24,576-byte EIP-170 limit", async () => {
      for (const name of ["Khai", "Kai", "KaiRenderer"]) {
        const artifact = JSON.parse(
          fs.readFileSync(path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`), "utf8"),
        );
        const size = (artifact.deployedBytecode.length - 2) / 2;
        expect(size, name).to.be.lessThan(24_576);
      }
      const sys = await loadFixture(bigPool);
      for (const c of [sys.khai, sys.kai, sys.renderer]) {
        const code = await sys.publicClient.getCode({ address: c.address });
        expect((code!.length - 2) / 2).to.be.lessThan(24_576);
      }
    });

    it("wires names, parameters and roles", async () => {
      const sys = await loadFixture(bigPool);
      expect(await sys.kai.read.name()).to.equal("Kai");
      expect(await sys.kai.read.symbol()).to.equal("KAI");
      expect(await sys.khai.read.name()).to.equal("Khai");
      expect(await sys.khai.read.price()).to.equal(PRICE);
      expect(await sys.khai.read.dailyLimit()).to.equal(DAILY_LIMIT);
      expect(await sys.khai.read.kai()).to.equal(getAddress(sys.kai.address));
      expect(await sys.kai.read.careFee()).to.equal(CARE_FEE);
      expect(await sys.kai.read.carePeriod()).to.equal(CARE_PERIOD);
      expect(await sys.kai.read.poolSize()).to.equal(60n);
      expect(await sys.khai.read.eggsAvailable()).to.equal(60n);
      await expect(sys.khai.write.setKai([sys.kai.address])).to.be.rejectedWith("KaiAlreadySet");
    });
  });

  describe("I1 eggs + pending hatches never exceed the pool", () => {
    it("I1 holds through a mixed sequence of buys, hatches and finishes", async () => {
      const sys = await loadFixture(bigPool);
      const [a, b, c] = sys.users;
      await assertI1(sys);
      await sys.khai.write.buy([2n], { account: a.account, value: PRICE * 2n });
      await assertI1(sys);
      await sys.khai.write.buyAndStartHatch({ account: b.account, value: PRICE });
      await assertI1(sys);
      await sys.kai.write.startHatch({ account: a.account });
      await assertI1(sys);
      await sys.khai.write.buy([3n], { account: c.account, value: PRICE * 3n });
      await assertI1(sys);
      await mine(3);
      await sys.kai.write.finishHatch([1n]);
      await assertI1(sys);
      await sys.kai.write.finishHatch([2n]);
      await assertI1(sys);
      expect(await sys.khai.read.totalSupply([EGG])).to.equal(4n);
      expect(await sys.kai.read.pendingHatches()).to.equal(0n);
      expect(await sys.kai.read.poolSize()).to.equal(58n);
      expect(await sys.khai.read.eggsAvailable()).to.equal(54n);
    });

    it("I1 SoldOut: a small pool cannot be oversold by either path, and every egg can still finish", async () => {
      const sys = await loadFixture(smallPool);
      const [a, b, c] = sys.users;
      await sys.khai.write.buy([2n], { account: a.account, value: PRICE * 2n });
      await expect(sys.khai.write.buy([2n], { account: b.account, value: PRICE * 2n })).to.be.rejectedWith("SoldOut");
      await sys.khai.write.buyAndStartHatch({ account: b.account, value: PRICE });
      await assertI1(sys);
      expect(await sys.khai.read.eggsAvailable()).to.equal(0n);
      await expect(sys.khai.write.buy([1n], { account: c.account, value: PRICE })).to.be.rejectedWith("SoldOut");
      await expect(sys.khai.write.buyAndStartHatch({ account: c.account, value: PRICE })).to.be.rejectedWith("SoldOut");
      // The two outstanding eggs hatch and finish; the pool empties exactly.
      await sys.kai.write.startHatch({ account: a.account });
      await sys.kai.write.startHatch({ account: a.account });
      await mine(3);
      for (const id of [1n, 2n, 3n]) await sys.kai.write.finishHatch([id]);
      expect(await sys.kai.read.poolSize()).to.equal(0n);
      expect(await sys.khai.read.totalSupply([EGG])).to.equal(0n);
      await assertI1(sys);
    });
  });

  describe("I2 tokenId == birdId, each bird minted once", () => {
    it("I2 every bird leaves the pool exactly once and its token id equals its bird id", async () => {
      const sys = await loadFixture(smallPool);
      const seen = new Set<bigint>();
      for (const u of sys.users.slice(0, 3)) {
        const { hatchId, tokenId } = await hatchAndFinish(sys, u);
        expect(seen.has(tokenId)).to.equal(false);
        seen.add(tokenId);
        expect(await sys.kai.read.ownerOf([tokenId])).to.equal(getAddress(addr(u)));
        const ch = await sys.kai.read.chicken([tokenId]);
        expect(ch.tokenId).to.equal(tokenId);
        expect(ch.hatchId).to.equal(hatchId);
        const expected = sys.birds[Number(tokenId) - 1];
        expect(ch.bird.breed).to.equal(expected.breed);
        expect(ch.bird.recordHash).to.equal(expected.recordHash);
      }
      expect([...seen].sort()).to.deep.equal([1n, 2n, 3n]);
      expect(await sys.kai.read.poolSize()).to.equal(0n);
      expect(await sys.kai.read.totalSupply()).to.equal(3n);
      const s = await sys.kai.read.stats();
      expect(s).to.deep.equal({ birdsRegistered: 3n, poolSize: 0n, hatched: 3n, pendingHatches: 0n, careProofs: 0n });
    });
  });

  describe("I3 a hatch finishes once with a deterministic seed", () => {
    it("I3 finishHatch reverts TooEarly before the reveal block and AlreadyFinished the second time", async () => {
      const sys = await loadFixture(bigPool);
      const hatchId = await buyAndHatch(sys, sys.users[0]);
      const h = await sys.kai.read.hatch([hatchId]);
      const startBlock = await sys.publicClient.getBlockNumber();
      expect(h.revealBlock).to.equal(startBlock + 2n);
      expect(h.birdId).to.equal(0);
      await expect(sys.kai.write.finishHatch([hatchId])).to.be.rejectedWith("TooEarly"); // block N+1
      await expect(sys.kai.write.finishHatch([hatchId])).to.be.rejectedWith("TooEarly"); // block N+2 == reveal
      await sys.kai.write.finishHatch([hatchId], { account: sys.users[5].account }); // anyone, block N+3
      await expect(sys.kai.write.finishHatch([hatchId])).to.be.rejectedWith("AlreadyFinished");
      await expect(sys.kai.write.finishHatch([999n])).to.be.rejectedWith("UnknownHatch");
    });

    it("I3 seed = keccak256(blockhash(revealBlock), hatchId) and index = seed % pool size", async () => {
      const sys = await loadFixture(bigPool);
      const hatchId = await buyAndHatch(sys, sys.users[0]);
      await mineToReveal(sys, hatchId);
      const poolBefore = await sys.kai.read.poolSize();
      await sys.kai.write.finishHatch([hatchId]);
      const h = await sys.kai.read.hatch([hatchId]);
      const block = await sys.publicClient.getBlock({ blockNumber: h.revealBlock });
      const expectedSeed = keccak256(
        encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [block.hash, hatchId]),
      );
      const [seed, poolAtFinish, index] = await sys.kai.read.hatchProof([hatchId]);
      expect(seed).to.equal(expectedSeed);
      expect(poolAtFinish).to.equal(poolBefore);
      expect(index).to.equal(BigInt(expectedSeed) % poolBefore);
      expect(h.usedFallback).to.equal(false);
    });

    it("I3 fallback: a hatch left past 256 blocks still finishes and is marked usedFallback", async () => {
      const sys = await loadFixture(bigPool);
      const hatchId = await buyAndHatch(sys, sys.users[0]);
      await mine(300);
      const hash = await sys.kai.write.finishHatch([hatchId]);
      const receipt = await sys.publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");
      const h = await sys.kai.read.hatch([hatchId]);
      expect(h.usedFallback).to.equal(true);
      expect(h.birdId).to.not.equal(0);
      const [seed] = await sys.kai.read.hatchProof([hatchId]);
      const expected = keccak256(
        encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [hatchId, h.revealBlock]),
      );
      expect(seed).to.equal(expected);
      const events = await sys.kai.getEvents.HatchFinished({}, { fromBlock: receipt.blockNumber });
      expect(events[0].args.usedFallback).to.equal(true);
      expect(events[0].args.seed).to.equal(expected);
    });
  });

  describe("I3 hatches finish in hatch-id order", () => {
    it("I3 finishHatch(id) first finishes every earlier pending hatch, each drawn from its own pool size", async () => {
      const sys = await loadFixture(bigPool);
      const ids: bigint[] = [];
      for (const u of sys.users.slice(0, 3)) ids.push(await buyAndHatch(sys, u));
      expect(await sys.kai.read.nextHatchToFinish()).to.equal(1n);
      await mineToReveal(sys, ids[2]);
      await sys.kai.write.finishHatch([ids[2]], { account: sys.users[7].account });
      expect(await sys.kai.read.pendingHatches()).to.equal(0n);
      expect(await sys.kai.read.nextHatchToFinish()).to.equal(0n);
      for (const [k, id] of ids.entries()) {
        const h = await sys.kai.read.hatch([id]);
        expect(h.birdId).to.not.equal(0);
        expect(await sys.kai.read.ownerOf([BigInt(h.birdId)])).to.equal(getAddress(addr(sys.users[k])));
        const [seed, size, index] = await sys.kai.read.hatchProof([id]);
        expect(size).to.equal(60n - BigInt(k));
        const block = await sys.publicClient.getBlock({ blockNumber: h.revealBlock });
        expect(verifyHatch({ hatchId: id, revealBlock: h.revealBlock, usedFallback: h.usedFallback, revealBlockHash: block.hash, poolSizeAtFinish: size }, { seed, index }).ok).to.equal(true);
      }
      for (const id of ids) await expect(sys.kai.write.finishHatch([id])).to.be.rejectedWith("AlreadyFinished");
    });

    it("I3 finishNext advances the queue in bounded steps and stops at a hatch that is not ready", async () => {
      const sys = await loadFixture(bigPool);
      for (const u of sys.users.slice(0, 3)) await buyAndHatch(sys, u);
      await mine(3);
      const late = await buyAndHatch(sys, sys.users[3]);
      await sys.kai.write.finishNext([2n]);
      expect(await sys.kai.read.nextHatchToFinish()).to.equal(3n);
      expect(await sys.kai.read.pendingHatches()).to.equal(2n);
      // Hatch 3 is ready, hatch 4 (started one block ago) is not: only one finishes.
      await sys.kai.write.finishNext([10n]);
      expect(await sys.kai.read.nextHatchToFinish()).to.equal(late);
      expect((await sys.kai.read.hatch([late])).birdId).to.equal(0);
      await mine(2);
      await sys.kai.write.finishNext([10n]);
      expect(await sys.kai.read.nextHatchToFinish()).to.equal(0n);
      expect(await sys.kai.read.totalSupply()).to.equal(4n);
      await sys.kai.write.finishNext([10n]); // empty queue is a no-op
      expect(await sys.kai.read.poolSize()).to.equal(56n);
    });
  });

  describe("I3 review fixes (M1, lows)", () => {
    it("I3 finish order cannot change any hatch's bird: finishHatch(3) equals finishing 1, 2, 3 one by one", async () => {
      const sys = await loadFixture(bigPool);
      for (const u of sys.users.slice(0, 3)) await buyAndHatch(sys, u);
      await mine(3);
      const snap = await takeSnapshot();
      const birds = async () => Promise.all([1n, 2n, 3n].map(async (id) => (await sys.kai.read.hatch([id])).birdId));
      await sys.kai.write.finishHatch([3n]);
      const direct = await birds();
      await snap.restore();
      for (const id of [1n, 2n, 3n]) await sys.kai.write.finishHatch([id]);
      const stepwise = await birds();
      await snap.restore();
      await sys.kai.write.finishNext([1n]);
      await sys.kai.write.finishNext([5n]);
      const viaQueue = await birds();
      expect(direct.every((b) => b !== 0)).to.equal(true);
      expect(stepwise).to.deep.equal(direct);
      expect(viaQueue).to.deep.equal(direct);
      await assertI1(sys);
    });

    it("I3 a hatch owned by a contract that rejects ERC-721 does not block the queue (_mint, not _safeMint)", async () => {
      const sys = await loadFixture(bigPool);
      const rejecting = await hre.viem.deployContract("RejectingHatcher", []);
      await rejecting.write.hatch([sys.khai.address], { value: PRICE });
      const after = await buyAndHatch(sys, sys.users[0]);
      await mineToReveal(sys, after);
      await sys.kai.write.finishHatch([after]);
      const first = await sys.kai.read.hatch([1n]);
      expect(first.owner).to.equal(getAddress(rejecting.address));
      expect(await sys.kai.read.ownerOf([BigInt(first.birdId)])).to.equal(getAddress(rejecting.address));
      expect(await sys.kai.read.nextHatchToFinish()).to.equal(0n);
    });

    it("payCare rejects absurd period counts; careFee must be > 0; setKai checks the pairing; birth dates are validated", async () => {
      const sys = await loadFixture(bigPool);
      const { tokenId } = await hatchAndFinish(sys, sys.users[0]);
      const max = await sys.kai.read.MAX_CARE_PERIODS();
      expect(max).to.equal(8760n);
      await expect(
        sys.kai.write.payCare([tokenId, max + 1n], { account: sys.users[0].account, value: CARE_FEE * (max + 1n) }),
      ).to.be.rejectedWith("TooManyPeriods");
      await sys.kai.write.payCare([tokenId, max], { account: sys.users[0].account, value: CARE_FEE * max });
      await expect(sys.kai.write.setCareFee([0n])).to.be.rejectedWith("ZeroFee");
      await expect(
        hre.viem.deployContract("Kai", [addr(sys.admin), addr(sys.farm), sys.khai.address, sys.renderer.address, 0n, CARE_PERIOD]),
      ).to.be.rejectedWith("ZeroFee");
      const khai2 = await hre.viem.deployContract("Khai", [addr(sys.admin), addr(sys.farm), PRICE, DAILY_LIMIT]);
      await expect(khai2.write.setKai([sys.kai.address])).to.be.rejectedWith("KaiMismatch");
      const now = await time.latest();
      const f = { account: sys.farm.account };
      const h = `0x${"44".repeat(32)}` as Hex;
      await expect(sys.kai.write.registerBirds([[{ breed: 0, sex: 0, plumage: 0, bornAt: 0, recordHash: h }]], f)).to.be.rejectedWith("InvalidBird");
      await expect(
        sys.kai.write.registerBirds([[{ breed: 0, sex: 0, plumage: 0, bornAt: now + 86_400, recordHash: h }]], f),
      ).to.be.rejectedWith("InvalidBird");
    });
  });

  describe("I4 daily quota", () => {
    it("I4 the quota holds across buy and buyAndStartHatch and across split purchases", async () => {
      const sys = await loadFixture(bigPool);
      const u = sys.users[0];
      await sys.khai.write.buy([1n], { account: u.account, value: PRICE });
      await sys.khai.write.buyAndStartHatch({ account: u.account, value: PRICE });
      expect(await sys.khai.read.boughtToday([addr(u)])).to.equal(2n);
      expect(await sys.khai.read.remainingToday([addr(u)])).to.equal(1n);
      await expect(sys.khai.write.buy([2n], { account: u.account, value: PRICE * 2n })).to.be.rejectedWith("DailyLimit");
      await sys.khai.write.buy([1n], { account: u.account, value: PRICE });
      await expect(sys.khai.write.buyAndStartHatch({ account: u.account, value: PRICE })).to.be.rejectedWith(
        "DailyLimit",
      );
      await expect(sys.khai.write.buy([1n], { account: u.account, value: PRICE })).to.be.rejectedWith("DailyLimit");
      expect(await sys.khai.read.remainingToday([addr(u)])).to.equal(0n);
      // Another wallet is unaffected.
      await sys.khai.write.buy([3n], { account: sys.users[1].account, value: PRICE * 3n });
      // Transferring eggs away does not reset the quota.
      await sys.khai.write.safeTransferFrom([addr(u), addr(sys.users[2]), EGG, 2n, "0x"], { account: u.account });
      await expect(sys.khai.write.buy([1n], { account: u.account, value: PRICE })).to.be.rejectedWith("DailyLimit");
    });

    it("I4 the quota rolls over at the UTC day boundary", async () => {
      const sys = await loadFixture(bigPool);
      const u = sys.users[0];
      const now = BigInt(await time.latest());
      const nextMidnight = (now / 86_400n + 1n) * 86_400n;
      await time.setNextBlockTimestamp(nextMidnight - 5n);
      await sys.khai.write.buy([3n], { account: u.account, value: PRICE * 3n });
      await time.setNextBlockTimestamp(nextMidnight - 1n);
      await expect(sys.khai.write.buy([1n], { account: u.account, value: PRICE })).to.be.rejectedWith("DailyLimit");
      await time.setNextBlockTimestamp(nextMidnight);
      await mine(1);
      expect(await sys.khai.read.boughtToday([addr(u)])).to.equal(0n);
      expect(await sys.khai.read.remainingToday([addr(u)])).to.equal(3n);
      await sys.khai.write.buy([3n], { account: u.account, value: PRICE * 3n });
      expect(await sys.khai.read.balanceOf([addr(u), EGG])).to.equal(6n);
    });
  });

  describe("I5 balances and withdrawals", () => {
    it("I5 each contract balance equals payments minus withdrawals and only FARM_ROLE withdraws", async () => {
      const sys = await loadFixture(bigPool);
      const [a, b] = sys.users;
      const bal = (address: `0x${string}`) => sys.publicClient.getBalance({ address });
      await sys.khai.write.buy([2n], { account: a.account, value: PRICE * 2n });
      const { tokenId } = await hatchAndFinish(sys, b);
      expect(await bal(sys.khai.address)).to.equal(PRICE * 3n);
      expect(await bal(sys.kai.address)).to.equal(0n);
      await sys.kai.write.payCare([tokenId, 4n], { account: a.account, value: CARE_FEE * 4n });
      expect(await bal(sys.kai.address)).to.equal(CARE_FEE * 4n);

      await expect(sys.khai.write.withdraw([addr(a)], { account: a.account })).to.be.rejectedWith(
        "AccessControlUnauthorizedAccount",
      );
      await expect(sys.kai.write.withdraw([addr(a)], { account: sys.admin.account })).to.be.rejectedWith(
        "AccessControlUnauthorizedAccount",
      );

      const sink = sys.users[9];
      const before = await bal(addr(sink));
      await sys.khai.write.withdraw([addr(sink)], { account: sys.farm.account });
      await sys.kai.write.withdraw([addr(sink)], { account: sys.farm.account });
      expect(await bal(addr(sink))).to.equal(before + PRICE * 3n + CARE_FEE * 4n);
      expect(await bal(sys.khai.address)).to.equal(0n);
      expect(await bal(sys.kai.address)).to.equal(0n);
      await sys.khai.write.buy([1n], { account: a.account, value: PRICE });
      expect(await bal(sys.khai.address)).to.equal(PRICE);
    });

    it("rejects wrong payments on buy, buyAndStartHatch and payCare", async () => {
      const sys = await loadFixture(bigPool);
      const u = sys.users[0];
      await expect(sys.khai.write.buy([2n], { account: u.account, value: PRICE })).to.be.rejectedWith("WrongPayment");
      await expect(sys.khai.write.buy([1n], { account: u.account, value: PRICE + 1n })).to.be.rejectedWith(
        "WrongPayment",
      );
      await expect(sys.khai.write.buy([0n], { account: u.account, value: 0n })).to.be.rejectedWith("ZeroQuantity");
      await expect(sys.khai.write.buyAndStartHatch({ account: u.account, value: 0n })).to.be.rejectedWith(
        "WrongPayment",
      );
      const { tokenId } = await hatchAndFinish(sys, u);
      await expect(sys.kai.write.payCare([tokenId, 2n], { account: u.account, value: CARE_FEE })).to.be.rejectedWith(
        "WrongPayment",
      );
      await expect(sys.kai.write.payCare([tokenId, 0n], { account: u.account, value: 0n })).to.be.rejectedWith(
        "ZeroQuantity",
      );
      expect(await sys.khai.read.boughtToday([addr(u)])).to.equal(1n);
    });
  });

  describe("I6 access control between contracts and the farm", () => {
    it("I6 only Kai burns eggs, only Khai calls startHatchFor, only FARM_ROLE registers birds and posts proofs", async () => {
      const sys = await loadFixture(bigPool);
      const [a, b] = sys.users;
      await sys.khai.write.buy([1n], { account: a.account, value: PRICE });
      await expect(sys.khai.write.burnForHatch([addr(a)], { account: a.account })).to.be.rejectedWith("OnlyKai");
      await expect(sys.khai.write.burnForHatch([addr(a)], { account: sys.admin.account })).to.be.rejectedWith(
        "OnlyKai",
      );
      await expect(sys.kai.write.startHatchFor([addr(b)], { account: b.account })).to.be.rejectedWith("OnlyKhai");
      await expect(sys.kai.write.startHatchFor([addr(b)], { account: sys.admin.account })).to.be.rejectedWith(
        "OnlyKhai",
      );
      // A user without eggs cannot start a hatch.
      await expect(sys.kai.write.startHatch({ account: b.account })).to.be.rejectedWith("ERC1155InsufficientBalance");
      await expect(
        sys.kai.write.registerBirds([[{ breed: 0, sex: 0, plumage: 0, bornAt: 1, recordHash: `0x${"11".repeat(32)}` }]], {
          account: sys.admin.account,
        }),
      ).to.be.rejectedWith("AccessControlUnauthorizedAccount");
      const { tokenId } = await hatchAndFinish(sys, b);
      await expect(
        sys.kai.write.postCareProof([tokenId, 0, `0x${"22".repeat(32)}`, "fed"], { account: b.account }),
      ).to.be.rejectedWith("AccessControlUnauthorizedAccount");
      await sys.kai.write.postCareProof([tokenId, 0, `0x${"22".repeat(32)}`, "fed"], { account: sys.farm.account });
      await expect(
        sys.kai.write.registerBirds([[{ breed: 10, sex: 0, plumage: 0, bornAt: 1, recordHash: `0x${"11".repeat(32)}` }]], {
          account: sys.farm.account,
        }),
      ).to.be.rejectedWith("InvalidBird");
      await expect(sys.khai.write.setPrice([1n], { account: sys.farm.account })).to.be.rejectedWith(
        "AccessControlUnauthorizedAccount",
      );
      await expect(sys.kai.write.setCareFee([1n], { account: sys.farm.account })).to.be.rejectedWith(
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("I7 transfer lock while care is overdue", () => {
    it("I7 an overdue chicken cannot be transferred, and can be again once care is paid", async () => {
      const sys = await loadFixture(bigPool);
      const [a, b, payer] = sys.users;
      const { tokenId } = await hatchAndFinish(sys, a);
      const ch = await sys.kai.read.chicken([tokenId]);
      const latest = BigInt(await time.latest());
      expect(ch.carePaidUntil).to.equal(latest + CARE_PERIOD);
      expect(await sys.kai.read.isOverdue([tokenId])).to.equal(false);

      await time.increaseTo(ch.carePaidUntil + 1n);
      expect(await sys.kai.read.isOverdue([tokenId])).to.equal(true);
      await expect(
        sys.kai.write.transferFrom([addr(a), addr(b), tokenId], { account: a.account }),
      ).to.be.rejectedWith("CareOverdue");

      // Anyone can pay; base is max(now, carePaidUntil).
      await sys.kai.write.payCare([tokenId, 2n], { account: payer.account, value: CARE_FEE * 2n });
      const paidAt = BigInt(await time.latest());
      const after = await sys.kai.read.chicken([tokenId]);
      expect(after.carePaidUntil).to.equal(paidAt + 2n * CARE_PERIOD);
      expect(await sys.kai.read.isOverdue([tokenId])).to.equal(false);
      await sys.kai.write.transferFrom([addr(a), addr(b), tokenId], { account: a.account });
      expect(await sys.kai.read.ownerOf([tokenId])).to.equal(getAddress(addr(b)));

      // Paying ahead extends from carePaidUntil, not from now.
      await sys.kai.write.payCare([tokenId, 1n], { account: b.account, value: CARE_FEE });
      expect((await sys.kai.read.chicken([tokenId])).carePaidUntil).to.equal(after.carePaidUntil + CARE_PERIOD);
      expect((await sys.kai.read.chickensOf([addr(b)])).map((c) => c.tokenId)).to.deep.equal([tokenId]);
      expect(await sys.kai.read.chickensOf([addr(a)])).to.deep.equal([]);
    });

    it("I7 minting is not blocked: a hatch finished long after it started still mints", async () => {
      const sys = await loadFixture(bigPool);
      const hatchId = await buyAndHatch(sys, sys.users[0]);
      await time.increase(Number(CARE_PERIOD) * 10);
      await mine(3);
      await sys.kai.write.finishHatch([hatchId]);
      const h = await sys.kai.read.hatch([hatchId]);
      expect(await sys.kai.read.isOverdue([BigInt(h.birdId)])).to.equal(false);
    });
  });

  describe("verify helper (lib/verifyHatch.ts)", () => {
    it("recomputes seed and index off-chain equal to the on-chain result, normal and fallback", async () => {
      const sys = await loadFixture(bigPool);
      const normal = await buyAndHatch(sys, sys.users[0]);
      const late = await buyAndHatch(sys, sys.users[1]);
      await mineToReveal(sys, late);
      await sys.kai.write.finishHatch([normal]);
      await mine(300);
      await sys.kai.write.finishHatch([late]);

      for (const hatchId of [normal, late]) {
        const h = await sys.kai.read.hatch([hatchId]);
        const [seed, poolSizeAtFinish, index] = await sys.kai.read.hatchProof([hatchId]);
        const block = await sys.publicClient.getBlock({ blockNumber: h.revealBlock });
        const input = {
          hatchId,
          revealBlock: h.revealBlock,
          usedFallback: h.usedFallback,
          revealBlockHash: block.hash as Hex,
          poolSizeAtFinish,
        };
        const res = verifyHatch(input, { seed, index });
        expect(res.ok, `hatch ${hatchId}`).to.equal(true);
        expect(computeHatchIndex(computeHatchSeed(input), poolSizeAtFinish)).to.equal(index);
      }
      expect((await sys.kai.read.hatch([late])).usedFallback).to.equal(true);
      expect((await sys.kai.read.hatch([normal])).usedFallback).to.equal(false);
      // A tampered block hash fails verification.
      const h = await sys.kai.read.hatch([normal]);
      const [seed, pool, index] = await sys.kai.read.hatchProof([normal]);
      const bad = verifyHatch(
        { hatchId: normal, revealBlock: h.revealBlock, usedFallback: false, revealBlockHash: `0x${"00".repeat(31)}01`, poolSizeAtFinish: pool },
        { seed, index },
      );
      expect(bad.seedMatches).to.equal(false);
    });

    it("hatchesOf lists hatch ids oldest first", async () => {
      const sys = await loadFixture(bigPool);
      const u = sys.users[0];
      await sys.khai.write.buy([2n], { account: u.account, value: PRICE * 2n });
      await sys.khai.write.buyAndStartHatch({ account: sys.users[1].account, value: PRICE });
      await sys.kai.write.startHatch({ account: u.account });
      await sys.khai.write.buyAndStartHatch({ account: u.account, value: PRICE });
      expect(await sys.kai.read.hatchesOf([addr(u)])).to.deep.equal([2n, 3n]);
      expect(await sys.kai.read.pendingHatches()).to.equal(3n);
      expect((await sys.kai.read.hatch([2n])).owner).to.equal(getAddress(addr(u)));
    });
  });

  describe("metadata", () => {
    it("tokenURI and uri decode to valid JSON whose image decodes to well-formed SVG", async () => {
      const sys = await loadFixture(bigPool);
      const { tokenId } = await hatchAndFinish(sys, sys.users[0]);
      const json = JSON.parse(decodeDataUri(await sys.kai.read.tokenURI([tokenId]), "data:application/json;base64,"));
      const b = sys.birds[Number(tokenId) - 1];
      const breed = await sys.renderer.read.breedName([b.breed]);
      expect(json.name).to.equal(`Kai #${tokenId} — ${breed}`);
      expect(json.description).to.match(/sponsor/i);
      const attrs = Object.fromEntries(json.attributes.map((x: { trait_type: string; value: unknown }) => [x.trait_type, x.value]));
      expect(attrs.Breed).to.equal(breed);
      expect(attrs.Sex).to.equal(b.sex === 1 ? "Rooster" : "Hen");
      expect(attrs.Plumage).to.equal(await sys.renderer.read.plumageName([b.plumage]));
      expect(attrs.Band).to.equal(`KK-${tokenId.toString().padStart(4, "0")}`);
      expect(attrs["Care status"]).to.equal("Active");
      expect(attrs.Born).to.equal(b.bornAt);
      const svg = decodeDataUri(json.image, "data:image/svg+xml;base64,");
      assertWellFormedSvg(svg);
      expect(svg).to.include('viewBox="0 0 400 400"');
      expect(svg).to.include(attrs.Band);
      expect(svg).to.include(breed);

      await time.increase(Number(CARE_PERIOD) + 10);
      const overdue = JSON.parse(decodeDataUri(await sys.kai.read.tokenURI([tokenId]), "data:application/json;base64,"));
      expect(overdue.attributes.find((x: { trait_type: string }) => x.trait_type === "Care status").value).to.equal("Overdue");

      const egg = JSON.parse(decodeDataUri(await sys.khai.read.uri([EGG]), "data:application/json;base64,"));
      expect(egg.name).to.equal("Khai Egg");
      assertWellFormedSvg(decodeDataUri(egg.image, "data:image/svg+xml;base64,"));
    });

    it("renders well-formed SVG for every breed, sex and plumage", async () => {
      const sys = await loadFixture(bigPool);
      for (let breed = 0; breed < 10; breed++) {
        for (let sex = 0; sex < 2; sex++) {
          const plumage = (breed + sex) % 8;
          const uri = await sys.renderer.read.chickenURI([
            BigInt(breed * 2 + sex + 1),
            { breed, sex, plumage, bornAt: 1_700_000_000, recordHash: `0x${"ab".repeat(32)}` },
            BigInt(2 ** 40),
          ]);
          const json = JSON.parse(decodeDataUri(uri, "data:application/json;base64,"));
          assertWellFormedSvg(decodeDataUri(json.image, "data:image/svg+xml;base64,"));
        }
      }
      expect(await sys.renderer.read.bandId([42n])).to.equal("KK-0042");
      expect(await sys.renderer.read.bandId([12345n])).to.equal("KK-12345");
    });

    it("renderer output matches design/svg/compose.mjs byte for byte", async () => {
      const sys = await loadFixture(bigPool);
      const compose = await loadCompose();
      const cases: [number, number, number, number][] = [];
      for (let breed = 0; breed < 10; breed++)
        for (let sex = 0; sex < 2; sex++) cases.push([breed, sex, (breed * 3 + sex * 5) % 8, [1, 42, 300, 12345][(breed + sex) % 4]]);
      for (const [breed, sex, plumage, tokenId] of cases) {
        const expected = compose.composeChicken({ breed, sex, plumage, tokenId });
        expect(await sys.renderer.read.chickenSvg([BigInt(tokenId), breed, sex, plumage]), `${breed}/${sex}/${plumage}`).to.equal(expected);
      }
      // Through chickenURI as well.
      const uri = await sys.renderer.read.chickenURI([
        7n,
        { breed: 4, sex: 1, plumage: 6, bornAt: 1_700_000_000, recordHash: `0x${"ab".repeat(32)}` },
        0n,
      ]);
      const json = JSON.parse(decodeDataUri(uri, "data:application/json;base64,"));
      expect(decodeDataUri(json.image, "data:image/svg+xml;base64,")).to.equal(
        compose.composeChicken({ breed: 4, sex: 1, plumage: 6, tokenId: 7 }),
      );
      expect(await sys.renderer.read.eggSvg()).to.equal(compose.composeEgg());
      const egg = JSON.parse(decodeDataUri(await sys.renderer.read.eggURI(), "data:application/json;base64,"));
      expect(decodeDataUri(egg.image, "data:image/svg+xml;base64,")).to.equal(compose.composeEgg());
      await expect(sys.renderer.read.chickenSvg([1n, 10, 0, 0])).to.be.rejectedWith("InvalidTraits");
      await expect(sys.renderer.read.chickenSvg([1n, 0, 2, 0])).to.be.rejectedWith("InvalidTraits");
      await expect(sys.renderer.read.chickenSvg([1n, 0, 0, 8])).to.be.rejectedWith("InvalidTraits");
    });

    it("tokenURI of a non-existent token reverts", async () => {
      const sys = await loadFixture(bigPool);
      await expect(sys.kai.read.tokenURI([1n])).to.be.rejectedWith("ERC721NonexistentToken");
    });
  });

  describe("care proofs", () => {
    it("careProofs paginates newest first", async () => {
      const sys = await loadFixture(bigPool);
      const { tokenId } = await hatchAndFinish(sys, sys.users[0]);
      for (let i = 0; i < 5; i++) {
        await sys.kai.write.postCareProof([tokenId, i % 6, keccak256(`0x0${i}`), `note ${i}`], {
          account: sys.farm.account,
        });
      }
      const notes = async (o: bigint, l: bigint) =>
        (await sys.kai.read.careProofs([tokenId, o, l])).map((p) => p.note);
      expect(await notes(0n, 2n)).to.deep.equal(["note 4", "note 3"]);
      expect(await notes(2n, 2n)).to.deep.equal(["note 2", "note 1"]);
      expect(await notes(4n, 10n)).to.deep.equal(["note 0"]);
      expect(await notes(5n, 1n)).to.deep.equal([]);
      expect(await notes(0n, 0n)).to.deep.equal([]);
      const [newest] = await sys.kai.read.careProofs([tokenId, 0n, 1n]);
      expect(newest.kind).to.equal(4);
      expect(newest.contentHash).to.equal(keccak256("0x04"));
      expect((await sys.kai.read.chicken([tokenId])).proofCount).to.equal(5n);
      expect((await sys.kai.read.stats()).careProofs).to.equal(5n);
    });

    it("rejects invalid kinds, long notes and unknown tokens", async () => {
      const sys = await loadFixture(bigPool);
      const { tokenId } = await hatchAndFinish(sys, sys.users[0]);
      const f = { account: sys.farm.account };
      const h = `0x${"33".repeat(32)}` as Hex;
      await expect(sys.kai.write.postCareProof([tokenId, 6, h, "x"], f)).to.be.rejectedWith("InvalidKind");
      await expect(sys.kai.write.postCareProof([tokenId, 1, h, "a".repeat(141)], f)).to.be.rejectedWith("NoteTooLong");
      await sys.kai.write.postCareProof([tokenId, 1, h, "a".repeat(140)], f);
      await expect(sys.kai.write.postCareProof([999n, 1, h, "x"], f)).to.be.rejectedWith("ERC721NonexistentToken");
    });
  });

  describe("pause", () => {
    it("pausing Khai stops sales; pausing Kai stops new hatches but pending hatches still finish", async () => {
      const sys = await loadFixture(bigPool);
      const u = sys.users[0];
      await sys.khai.write.buy([2n], { account: u.account, value: PRICE * 2n });
      const pending = await buyAndHatch(sys, sys.users[1]);

      await expect(sys.khai.write.pause({ account: u.account })).to.be.rejectedWith("AccessControlUnauthorizedAccount");
      await sys.khai.write.pause();
      await expect(sys.khai.write.buy([1n], { account: u.account, value: PRICE })).to.be.rejectedWith("EnforcedPause");
      await expect(sys.khai.write.buyAndStartHatch({ account: u.account, value: PRICE })).to.be.rejectedWith(
        "EnforcedPause",
      );
      await sys.khai.write.unpause();

      await sys.kai.write.pause();
      await expect(sys.kai.write.startHatch({ account: u.account })).to.be.rejectedWith("EnforcedPause");
      await expect(sys.khai.write.buyAndStartHatch({ account: u.account, value: PRICE })).to.be.rejectedWith(
        "EnforcedPause",
      );
      await mineToReveal(sys, pending);
      await sys.kai.write.finishHatch([pending]);
      await sys.kai.write.unpause();
      await sys.kai.write.startHatch({ account: u.account });
      expect(await sys.kai.read.pendingHatches()).to.equal(1n);
    });

    it("admin setters update price, limit, care fee and renderer", async () => {
      const sys = await loadFixture(bigPool);
      await sys.khai.write.setPrice([PRICE * 2n]);
      await sys.khai.write.setDailyLimit([5n]);
      await sys.kai.write.setCareFee([CARE_FEE * 3n]);
      expect(await sys.khai.read.price()).to.equal(PRICE * 2n);
      expect(await sys.khai.read.remainingToday([addr(sys.users[0])])).to.equal(5n);
      expect(await sys.kai.read.careFee()).to.equal(CARE_FEE * 3n);
      await expect(sys.kai.write.setRenderer([zeroAddress])).to.be.rejectedWith("ZeroAddress");
      const r2 = await hre.viem.deployContract("KaiRenderer", []);
      await sys.kai.write.setRenderer([r2.address]);
      expect(await sys.kai.read.renderer()).to.equal(getAddress(r2.address));
    });
  });
});

describe("sample birds (lib/sampleBirds.ts)", () => {
  it("are deterministic, varied and within the trait ranges", async () => {
    const { sampleBirds, SAMPLE_REFERENCE_DATE } = await import("../lib/sampleBirds");
    const a = sampleBirds();
    expect(a).to.have.length(300);
    expect(sampleBirds()).to.deep.equal(a);
    expect(new Set(a.map((b) => b.breed)).size).to.equal(10);
    expect(new Set(a.map((b) => b.plumage)).size).to.equal(8);
    expect(new Set(a.map((b) => b.sex)).size).to.equal(2);
    expect(new Set(a.map((b) => b.recordHash)).size).to.equal(300);
    for (const b of a) {
      const ageDays = (SAMPLE_REFERENCE_DATE - b.bornAt) / 86_400;
      expect(ageDays).to.be.within(90, 24 * 30 + 29);
    }
  });
});
