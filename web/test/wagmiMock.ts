// A scripted stand-in for wagmi's React hooks so pages can be rendered with fixed chain data in jsdom.
import { vi } from "vitest";

export const ME = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const FARM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const ZERO = "0x0000000000000000000000000000000000000000";
export const DEPLOYMENT = {
  khai: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  kai: "0x9fE46736679d2D9a65F0992F2272de9f3c7fa6e0",
  renderer: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
} as const;

type Reader = (args: readonly unknown[]) => unknown;

export const state = {
  deployed: true,
  account: undefined as { address: string; chainId: number } | undefined,
  /** keyed by contract function name */
  reads: {} as Record<string, Reader>,
  blockNumber: 1000n,
  blockTimestamp: 1_800_000_000n,
  balance: 5_000_000_000_000_000_000n,
};

export function reset() {
  state.deployed = true;
  state.account = undefined;
  state.reads = {};
  state.blockNumber = 1000n;
  state.blockTimestamp = 1_800_000_000n;
  for (const fn of Object.values(actions)) if (typeof fn === "function" && "mockClear" in fn) fn.mockClear();
}

function read(functionName: string, args: readonly unknown[] = []): { data?: unknown; isError: boolean } {
  const reader = state.reads[functionName];
  if (!reader) return { data: undefined, isError: false };
  try {
    return { data: reader(args), isError: false };
  } catch {
    return { data: undefined, isError: true };
  }
}

const noop = () => undefined;

export const wagmiMock = {
  useAccount: () => ({
    address: state.account?.address,
    isConnected: !!state.account,
    chainId: state.account?.chainId,
  }),
  useReadContract: (p: { functionName: string; args?: readonly unknown[]; query?: { enabled?: boolean } }) => {
    if (p.query?.enabled === false) return { data: undefined, isLoading: false, isFetching: false, isError: false, isFetched: false, refetch: noop };
    const r = read(p.functionName, p.args);
    return { data: r.data, isLoading: false, isFetching: false, isError: r.isError, isFetched: true, refetch: noop };
  },
  useReadContracts: (p: { contracts: { functionName: string; args?: readonly unknown[] }[]; query?: { enabled?: boolean } }) => {
    if (p.query?.enabled === false) return { data: undefined, isLoading: false, isFetching: false, isFetched: false, refetch: noop };
    const data = p.contracts.map((c) => {
      const r = read(c.functionName, c.args);
      return r.isError || r.data === undefined ? { status: "failure" as const, error: new Error("no data") } : { status: "success" as const, result: r.data };
    });
    return { data, isLoading: false, isFetching: false, isFetched: true, refetch: noop };
  },
  useBlock: () => ({ data: { timestamp: state.blockTimestamp, hash: `0x${"ab".repeat(32)}` }, dataUpdatedAt: Date.now() }),
  useBlockNumber: () => ({ data: state.blockNumber }),
  useBalance: () => ({ data: { value: state.balance } }),
  useConnect: () => ({ connectAsync: vi.fn(), isPending: false, variables: undefined }),
  useConnectors: () => [],
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useConfig: () => ({}),
};

export const actions = {
  getAccount: vi.fn(() => ({ address: state.account?.address })),
  simulateContract: vi.fn(async () => ({})),
  writeContract: vi.fn(async () => `0x${"cd".repeat(32)}`),
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success", logs: [] })),
  estimateGas: vi.fn(async () => 100_000n),
  getBlock: vi.fn(async () => ({ hash: `0x${"ab".repeat(32)}` })),
};
