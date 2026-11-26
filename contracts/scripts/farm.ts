import { formatEther, isAddress, isHex, keccak256, parseEther, toBytes, type Address, type Hex } from "viem";
import { contracts, requireAllowedChain, waitTx } from "./lib/common";

/**
 * Farm admin CLI. `hardhat run` takes no arguments, so the command comes from env vars:
 *   FARM_CMD=status
 *   FARM_CMD=withdraw TO=0x...                      (withdraws both Khai and Kai balances)
 *   FARM_CMD=setPrice VALUE=0.01                    (tBNB)
 *   FARM_CMD=setCareFee VALUE=0.001                 (tBNB)
 *   FARM_CMD=setDailyLimit VALUE=3                  (eggs per wallet per UTC day)
 *   FARM_CMD=pause | unpause                        (both contracts)
 *   FARM_CMD=postCareProof TOKEN=12 KIND=0 NOTE="Morning feed" [CONTENT_HASH=0x...]
 *     KIND: 0 Feeding, 1 Health check, 2 Weight, 3 Vaccination, 4 Photo, 5 Note.
 *     CONTENT_HASH defaults to keccak256 of NOTE.
 *   FARM_CMD=confirmRedeem TOKEN=12 [NOTE="Handed over to the sponsor"]   (hashes NOTE as the handover record)
 *   FARM_CMD=release TOKEN=12                       (only when care has been overdue for more than 3 periods)
 */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const chainId = await requireAllowedChain();
  const { khai, kai } = await contracts(chainId);
  const cmd = need("FARM_CMD");
  switch (cmd) {
    case "status": {
      const s = await kai.read.stats();
      console.log({
        price: formatEther(await khai.read.price()),
        dailyLimit: (await khai.read.dailyLimit()).toString(),
        careFee: formatEther(await kai.read.careFee()),
        eggsAvailable: (await khai.read.eggsAvailable()).toString(),
        khaiPaused: await khai.read.paused(),
        kaiPaused: await kai.read.paused(),
        stats: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.toString()])),
        collected: s.collected.toString(),
        released: s.released.toString(),
        pendingRedeems: (await kai.read.pendingRedeems()).map((id) => id.toString()),
      });
      return;
    }
    case "withdraw": {
      const to = need("TO");
      if (!isAddress(to)) throw new Error("TO is not an address");
      await waitTx(await khai.write.withdraw([to as Address]));
      await waitTx(await kai.write.withdraw([to as Address]));
      console.log(`Withdrew Khai and Kai balances to ${to}`);
      return;
    }
    case "setPrice":
      await waitTx(await khai.write.setPrice([parseEther(need("VALUE"))]));
      console.log(`Egg price set to ${need("VALUE")} tBNB`);
      return;
    case "setDailyLimit": {
      const limit = BigInt(need("VALUE"));
      if (limit < 1n || limit > 1000n) throw new Error("VALUE must be between 1 and 1000");
      await waitTx(await khai.write.setDailyLimit([limit]));
      console.log(`Daily limit set to ${limit} eggs per wallet`);
      return;
    }
    case "setCareFee":
      await waitTx(await kai.write.setCareFee([parseEther(need("VALUE"))]));
      console.log(`Care fee set to ${need("VALUE")} tBNB`);
      return;
    case "pause":
      await waitTx(await khai.write.pause());
      await waitTx(await kai.write.pause());
      console.log("Khai and Kai paused");
      return;
    case "unpause":
      await waitTx(await khai.write.unpause());
      await waitTx(await kai.write.unpause());
      console.log("Khai and Kai unpaused");
      return;
    case "postCareProof": {
      const tokenId = BigInt(need("TOKEN"));
      const kind = Number(need("KIND"));
      const note = process.env.NOTE ?? "";
      const contentHash = (process.env.CONTENT_HASH ?? keccak256(toBytes(note))) as Hex;
      if (!isHex(contentHash) || contentHash.length !== 66) throw new Error("CONTENT_HASH must be 32 bytes hex");
      await waitTx(await kai.write.postCareProof([tokenId, kind, contentHash, note]));
      console.log(`Care proof posted for Kai #${tokenId}`);
      return;
    }
    case "confirmRedeem": {
      const tokenId = BigInt(need("TOKEN"));
      const handoverHash = keccak256(toBytes(process.env.NOTE ?? `handover of Kai #${tokenId}`));
      await waitTx(await kai.write.confirmRedeem([tokenId, handoverHash]));
      console.log(`Handover confirmed for Kai #${tokenId} (record ${handoverHash})`);
      return;
    }
    case "release": {
      const tokenId = BigInt(need("TOKEN"));
      await waitTx(await kai.write.release([tokenId]));
      console.log(`Kai #${tokenId} released: the bird is back in the pool`);
      return;
    }
    default:
      throw new Error(`Unknown FARM_CMD ${cmd}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
