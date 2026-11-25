import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { kaiAbi } from "../abi/kai";
import { khaiAbi } from "../abi/khai";
import { deployment, targetChain } from "../config/chains";

const chainId = targetChain.id;
const POLL = 5000;

export const useDeployment = () => deployment;

export function useStats() {
  const q = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "stats",
    chainId,
    query: { enabled: !!deployment, refetchInterval: POLL },
  });
  return q;
}

/** Bird ids that have a token, via tokenByIndex (tokenId == birdId). */
export function useSponsoredIds(hatched: number | undefined) {
  const contracts = useMemo(
    () =>
      Array.from({ length: hatched ?? 0 }, (_, i) => ({
        address: deployment?.kai as Address,
        abi: kaiAbi,
        functionName: "tokenByIndex" as const,
        args: [BigInt(i)] as const,
        chainId,
      })),
    [hatched],
  );
  const q = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: !!deployment && !!hatched, refetchInterval: POLL * 2 },
  });
  const ids = useMemo(() => {
    const set = new Set<number>();
    for (const r of q.data ?? []) if (r.status === "success") set.add(Number(r.result));
    return set;
  }, [q.data]);
  return { ids, isLoading: q.isLoading };
}

export function useEggInfo() {
  const { address } = useAccount();
  const khai = deployment?.khai;
  const base = { address: khai, abi: khaiAbi, chainId } as const;
  const q = useReadContracts({
    contracts: [
      { ...base, functionName: "price" },
      { ...base, functionName: "dailyLimit" },
      { ...base, functionName: "eggsAvailable" },
      { ...base, functionName: "remainingToday", args: [address ?? "0x0000000000000000000000000000000000000000"] },
      { ...base, functionName: "boughtToday", args: [address ?? "0x0000000000000000000000000000000000000000"] },
      { ...base, functionName: "paused" },
    ],
    query: { enabled: !!khai, refetchInterval: POLL },
  });
  const [price, limit, available, remaining, bought, paused] = q.data ?? [];
  return {
    price: price?.result as bigint | undefined,
    dailyLimit: limit?.result as bigint | undefined,
    available: available?.result as bigint | undefined,
    remaining: address ? (remaining?.result as bigint | undefined) : undefined,
    bought: address ? (bought?.result as bigint | undefined) : undefined,
    paused: paused?.result as boolean | undefined,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}

export function useCareParams() {
  const kai = deployment?.kai;
  const q = useReadContracts({
    contracts: [
      { address: kai, abi: kaiAbi, functionName: "careFee", chainId },
      { address: kai, abi: kaiAbi, functionName: "carePeriod", chainId },
    ],
    query: { enabled: !!kai, staleTime: 60_000 },
  });
  return { careFee: q.data?.[0]?.result as bigint | undefined, carePeriod: q.data?.[1]?.result as bigint | undefined };
}

export function useChicken(tokenId: bigint | undefined) {
  return useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "chicken",
    args: [tokenId ?? 0n],
    chainId,
    query: { enabled: !!deployment && tokenId !== undefined, refetchInterval: POLL, retry: false },
  });
}

export function useHatch(hatchId: bigint | undefined) {
  return useReadContracts({
    contracts: [
      { address: deployment?.kai, abi: kaiAbi, functionName: "hatch", args: [hatchId ?? 0n], chainId },
      { address: deployment?.kai, abi: kaiAbi, functionName: "hatchProof", args: [hatchId ?? 0n], chainId },
    ],
    query: { enabled: !!deployment && hatchId !== undefined, refetchInterval: POLL },
  });
}

export function useFarmRole() {
  const { address } = useAccount();
  const role = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "FARM_ROLE",
    chainId,
    query: { enabled: !!deployment, staleTime: Infinity },
  });
  const has = useReadContract({
    address: deployment?.kai,
    abi: kaiAbi,
    functionName: "hasRole",
    args: [role.data as `0x${string}`, address as Address],
    chainId,
    query: { enabled: !!deployment && !!address && !!role.data, refetchInterval: 30_000 },
  });
  return { isFarm: has.data === true, isLoading: role.isLoading || has.isLoading };
}
