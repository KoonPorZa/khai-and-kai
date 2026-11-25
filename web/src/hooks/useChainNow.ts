import { useEffect, useState } from "react";
import { useBlock } from "wagmi";
import { targetChain } from "../config/chains";

/** Chain time in whole seconds, anchored to the latest block and ticking locally every second. */
export function useChainNow(): number {
  const { data, dataUpdatedAt } = useBlock({ chainId: targetChain.id, query: { refetchInterval: 5000 } });
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!data) return Math.floor(tick / 1000);
  const base = Number(data.timestamp);
  return base + Math.max(0, Math.floor((tick - dataUpdatedAt) / 1000));
}
