import { BaseError, ChainMismatchError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { nativeSymbol, networkLabel } from "../config/chains";
import { tNow } from "../i18n";
import type { Key } from "../i18n/en";

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

const noWallet = (): FriendlyError => ({ kind: "wallet", title: tNow("err.noWallet"), detail: tNow("err.noWalletDetail") });

const CONTRACT_ERRORS = new Set([
  "DailyLimit",
  "SoldOut",
  "WrongPayment",
  "ZeroQuantity",
  "TooEarly",
  "AlreadyFinished",
  "UnknownHatch",
  "CareOverdue",
  "EnforcedPause",
  "NoteTooLong",
  "InvalidKind",
  "InvalidBird",
  "PoolExhausted",
  "AccessControlUnauthorizedAccount",
  "NotTokenOwner",
  "RedeemPending",
  "NoRedeemRequest",
  "AlreadyRedeemed",
  "RedeemDeclined",
  "NotReleasable",
  "TooManyPeriods",
  "ERC1155InsufficientBalance",
]);

/** Turns viem and wagmi errors into short sentences for the user. */
export function friendlyError(error: unknown): FriendlyError {
  if (error instanceof Error && (/ProviderNotFound|ConnectorNotFound/i.test(error.name) || /provider not found|connector not found/i.test(error.message))) {
    return noWallet();
  }
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return { kind: "rejected", title: tNow("err.cancelled") };
    }
    if (error.walk((e) => e instanceof ChainMismatchError) || /does not match the target chain|chain mismatch/i.test(error.message)) {
      return { kind: "network", title: tNow("err.wrongNetwork"), detail: tNow("err.wrongNetworkDetail", { network: networkLabel }) };
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason ?? "";
      if (CONTRACT_ERRORS.has(name)) return { kind: "contract", title: tNow(`err.${name}` as Key) };
      if (name) return { kind: "contract", title: tNow("err.rejectedContract", { name }) };
    }
    if (/insufficient funds|exceeds the balance|insufficient balance/i.test(error.message)) {
      return {
        kind: "funds",
        title: tNow("err.funds", { symbol: nativeSymbol }),
        detail: tNow("err.fundsDetail", { network: networkLabel }),
      };
    }
    if (/user rejected|user denied|rejected the request/i.test(error.message)) {
      return { kind: "rejected", title: tNow("err.cancelled") };
    }
    return { kind: "other", title: tNow("err.sendFailed"), detail: plain(error.shortMessage) };
  }
  if (error instanceof Error && /user rejected|user denied/i.test(error.message)) {
    return { kind: "rejected", title: tNow("err.cancelled") };
  }
  return { kind: "other", title: tNow("err.generic"), detail: error instanceof Error ? plain(error.message) : undefined };
}
