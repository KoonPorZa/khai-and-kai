import { BaseError, ChainMismatchError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { nativeSymbol, networkLabel } from "../config/chains";

export type FriendlyError = { title: string; detail?: string; kind: "rejected" | "network" | "funds" | "contract" | "wallet" | "other" };

/**
 * Text that is safe to show: first line only, cut before library footers ("Version: ...", "Docs: ...", "Details: ..."),
 * and nothing that names a library package. Returns undefined when nothing readable is left.
 */
export function plain(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const first = (text.split(/\n|Version:|Docs:|Details:|Request Arguments:/)[0] ?? "").trim();
  if (!first || /@?wagmi|viem|@wagmi|\bat\s+\S+\s*\(|node_modules/i.test(first)) return undefined;
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

const NO_WALLET: FriendlyError = {
  kind: "wallet",
  title: "No wallet found in this browser.",
  detail: "Install a wallet extension, or open this page inside your wallet app's browser, then try again.",
};

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
  NotTokenOwner: "Only the sponsor of this chicken can do that.",
  RedeemPending: "A collection request is already pending for this chicken. It cannot be transferred meanwhile.",
  NoRedeemRequest: "There is no pending collection request for this chicken.",
  AlreadyRedeemed: "This bird has already been collected. Its care is closed.",
  NotReleasable: "This bird cannot be returned to the coop yet: care must be overdue for more than 3 periods.",
  TooManyPeriods: "That is more care periods than the contract accepts at once.",
  ERC1155InsufficientBalance: "You have no eggs to hatch.",
};

/** Turns viem and wagmi errors into short sentences for the user. */
export function friendlyError(error: unknown): FriendlyError {
  if (error instanceof Error && (/ProviderNotFound|ConnectorNotFound/i.test(error.name) || /provider not found|connector not found/i.test(error.message))) {
    return NO_WALLET;
  }
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
    return { kind: "other", title: "The transaction could not be sent.", detail: plain(error.shortMessage) };
  }
  if (error instanceof Error && /user rejected|user denied/i.test(error.message)) {
    return { kind: "rejected", title: "You cancelled the request in your wallet." };
  }
  return { kind: "other", title: "Something went wrong.", detail: error instanceof Error ? plain(error.message) : undefined };
}
