import { useCallback, useState } from "react";
import { useConfig } from "wagmi";
import { getAccount, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { Abi, Address, Hex, TransactionReceipt } from "viem";
import { targetChain } from "../config/chains";
import { friendlyError, type FriendlyError } from "../lib/errors";
import { useToast } from "../components/Toast";

export type TxCall = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
export type TxState = { status: "idle" | "wallet" | "pending" | "done" | "error"; hash?: Hex; error?: FriendlyError };

/** simulate, ask the wallet, wait for the receipt. Resolves to the receipt, or undefined after showing the error. */
export function useTx() {
  const config = useConfig();
  const toast = useToast();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const run = useCallback(
    async (call: TxCall): Promise<TransactionReceipt | undefined> => {
      setState({ status: "wallet" });
      try {
        const account = getAccount(config).address;
        const params = { ...call, chainId: targetChain.id, account } as never;
        await simulateContract(config, params);
        const hash = await writeContract(config, params);
        setState({ status: "pending", hash });
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: targetChain.id });
        if (receipt.status !== "success") throw new Error("The transaction was reverted on chain.");
        setState({ status: "done", hash });
        return receipt;
      } catch (e) {
        const error = friendlyError(e);
        setState({ status: "error", error });
        if (error.kind !== "rejected") toast("error", error.title, error.detail);
        else toast("info", error.title);
        return undefined;
      }
    },
    [config, toast],
  );
  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, run, reset, busy: state.status === "wallet" || state.status === "pending" };
}
