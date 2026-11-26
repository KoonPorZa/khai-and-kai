// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ME, reset, state } from "./wagmiMock";

vi.mock("wagmi", async () => (await import("./wagmiMock")).wagmiMock);
vi.mock("wagmi/actions", async () => (await import("./wagmiMock")).actions);
vi.mock("../src/config/chains", async (original) => {
  const real = await original<typeof import("../src/config/chains")>();
  const mock = await import("./wagmiMock");
  return {
    ...real,
    get deployment() {
      return mock.state.deployed ? mock.DEPLOYMENT : undefined;
    },
  };
});

import { th } from "../src/i18n/th";
import { App } from "../src/App";
import { LangProvider } from "../src/i18n";
import { CoopGrid } from "../src/components/CoopGrid";

const ETH = 10n ** 18n;

function show(path: string) {
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </LangProvider>,
  );
}

beforeEach(() => {
  reset();
  window.localStorage.setItem("kk.lang", "th");
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  window.scrollTo = (() => undefined) as never;
  Object.assign(state.reads, {
    price: () => ETH / 100n,
    dailyLimit: () => 3n,
    eggsAvailable: () => 7n,
    remainingToday: () => 3n,
    boughtToday: () => 0n,
    paused: () => false,
    careFee: () => ETH / 1000n,
    carePeriod: () => 3600n,
    stats: () => ({ birdsRegistered: 30n, poolSize: 26n, hatched: 3n, pendingHatches: 1n, careProofs: 5n, collected: 0n, released: 0n, hatchCount: 3n }),
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem("kk.lang");
});

describe("Thai: hatch and coop", () => {
  it("renders the coop heading and the connect button in Thai", () => {
    show("/coop");
    expect(screen.getByRole("heading", { name: "เล้าของฉัน" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "เชื่อมกระเป๋า" }).length).toBeGreaterThan(0);
  });

  it("renders the connected coop with an egg and the primary button in Thai", () => {
    state.account = { address: ME, chainId: 97 };
    Object.assign(state.reads, { balanceOf: () => 2n, hatchesOf: () => [], chickensOf: () => [] });
    show("/coop");
    expect(screen.getByRole("heading", { name: "เล้าของฉัน" })).toBeTruthy();
    expect(screen.getByText("ไข่ 2 ฟองรออยู่")).toBeTruthy();
    expect(screen.getByRole("button", { name: th["coop.hatchOne"] })).toBeTruthy();
  });

  it("renders the hatch page heading and the reveal button in Thai", () => {
    state.account = { address: ME, chainId: 97 };
    state.reads.hatch = () => ({ owner: ME, revealBlock: 1002n, birdId: 0, usedFallback: false });
    state.reads.hatchProof = () => [`0x${"00".repeat(32)}`, 0n, 0n];
    state.blockNumber = 1003n;
    show("/hatch/5");
    expect(screen.getByRole("heading", { name: "ไข่ของคุณพร้อมแล้ว" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ยืนยันเปิดผลในกระเป๋า" })).toBeTruthy();
  });

  it("renders the grid legend and labels in Thai", () => {
    render(
      <LangProvider>
        <MemoryRouter>
          <CoopGrid total={10} sponsored={new Set([2, 5])} pending={3} columns={5} />
        </MemoryRouter>
      </LangProvider>,
    );
    expect(screen.getByText("อุปถัมภ์ 2")).toBeTruthy();
    expect(screen.getByLabelText(th["coop.cellOpen"].replace("{band}", "KK-0005"))).toBeTruthy();
  });
});

