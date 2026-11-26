import { BaseError, ChainMismatchError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { nativeSymbol, networkLabel } from "../config/chains";

export type FriendlyError = { title: string; detail?: string; kind: "rejected" | "network" | "funds" | "contract" | "other" };

const CONTRACT_MESSAGES: Record<string, string> = {
  DailyLimit: "You have reached today's egg limit. The quota resets at 00:00 UTC.",
  SoldOut: "Every egg is spoken for. There are no birds left waiting in the coop.",
  WrongPayment: "The amount sent does not match the price. Refresh the page and try again.",
  ZeroQuantity: "Choose at least one.",
  TooEarly: "The reveal block has not passed yet. Wait a moment and try again.",
  AlreadyFinished: "This hatch is already finished.",
  UnknownHatch: "That hatch does not exist.",
  CareOverdue: "Care is overdue. Pay care, then try again.",
  EnforcedPause: "The contract is paused right now.",
  NoteTooLong: "The note is longer than 140 bytes.",
  InvalidKind: "Unknown record type.",
  InvalidBird: "That bird is not registered.",
  PoolExhausted: "No birds left in the coop.",
  AccessControlUnauthorizedAccount: "This wallet is not the farm account.",
  ERC1155InsufficientBalance: "You have no eggs to hatch.",
};

/** Turns viem and wagmi errors into short sentences for the user. */
export function friendlyError(error: unknown): FriendlyError {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return { kind: "rejected", title: "You cancelled the request in your wallet." };
    }
    if (error.walk((e) => e instanceof ChainMismatchError) || /does not match the target chain|chain mismatch/i.test(error.message)) {
      return { kind: "network", title: "Your wallet is on the wrong network.", detail: `Switch to ${networkLabel} and try again.` };
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason ?? "";
      const message = CONTRACT_MESSAGES[name];
      if (message) return { kind: "contract", title: message };
      if (name) return { kind: "contract", title: `The contract rejected the request (${name}).` };
    }
    if (/insufficient funds|exceeds the balance|insufficient balance/i.test(error.message)) {
      return {
        kind: "funds",
        title: `Not enough ${nativeSymbol} in this wallet.`,
        detail: `Get test coins from the ${networkLabel} faucet, then try again.`,
      };
    }
    if (/user rejected|user denied|rejected the request/i.test(error.message)) {
      return { kind: "rejected", title: "You cancelled the request in your wallet." };
    }
    return { kind: "other", title: "The transaction could not be sent.", detail: error.shortMessage };
  }
  if (error instanceof Error && /user rejected|user denied/i.test(error.message)) {
    return { kind: "rejected", title: "You cancelled the request in your wallet." };
  }
  return { kind: "other", title: "Something went wrong.", detail: error instanceof Error ? error.message : undefined };
}
