import { parseEventLogs, type TransactionReceipt } from "viem";
import { kaiAbi } from "../abi/kai";

/** Reads the hatch id from the HatchStarted event in a receipt (no log query involved). */
export function hatchIdFromReceipt(receipt: TransactionReceipt): bigint | undefined {
  const logs = parseEventLogs({ abi: kaiAbi, eventName: "HatchStarted", logs: receipt.logs });
  return logs[0]?.args.hatchId;
}
