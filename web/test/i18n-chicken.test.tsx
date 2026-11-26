// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

import { ToastProvider } from "../src/components/Toast";
import { WalletProvider } from "../src/components/Wallet";
import { LangProvider } from "../src/i18n";
import { ChickenPage } from "../src/pages/Chicken";

const ETH = 10n ** 18n;
const chicken = (owner: string, paidUntilOffset: number) => ({
  tokenId: 4n,
  owner,
  bird: { breed: 0, sex: 0, plumage: 0, bornAt: 1_790_000_000n, recordHash: `0x${"00".repeat(32)}` },
  carePaidUntil: state.blockTimestamp + BigInt(paidUntilOffset),
  hatchId: 0n,
  proofCount: 0n,
  redeemRequestedAt: 0n,
  redeemedAt: 0n,
});

function setup(lang: "th" | "en") {
  window.localStorage.setItem("kk.lang", lang);
  Object.assign(state.reads, {
    careFee: () => ETH / 1000n,
    carePeriod: () => 3600n,
    MAX_CARE_PERIODS: () => 8760n,
    chicken: () => chicken(ME, 2520),
  });
  state.account = { address: ME, chainId: 97 };
  return render(
    <LangProvider>
      <ToastProvider>
        <WalletProvider>
          <MemoryRouter initialEntries={["/chicken/4"]}>
            <Routes>
              <Route path="/chicken/:id" element={<ChickenPage />} />
            </Routes>
          </MemoryRouter>
        </WalletProvider>
      </ToastProvider>
    </LangProvider>,
  );
}

beforeEach(() => {
  reset();
  window.localStorage.clear();
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  window.scrollTo = (() => undefined) as never;
});
afterEach(cleanup);

describe("chicken page language", () => {
  it("renders Thai for the care card, pay button and collect request", () => {
    setup("th");
    expect(screen.getByRole("heading", { name: "จ่ายค่าเลี้ยงแล้ว" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "จ่ายค่าเลี้ยง" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ขอรับไก่ตัวจริง" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "บันทึกการเลี้ยง" })).toBeTruthy();
  });

  it("keeps English when the language is English", () => {
    setup("en");
    expect(screen.getByRole("button", { name: "Pay care" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collect this bird" })).toBeTruthy();
  });
});

describe("farm page language", () => {
  it("renders Thai for the farm page when not connected", async () => {
    window.localStorage.setItem("kk.lang", "th");
    state.account = undefined as never;
    const { Farm } = await import("../src/pages/Farm");
    render(
      <LangProvider>
        <ToastProvider>
          <WalletProvider>
            <MemoryRouter>
              <Farm />
            </MemoryRouter>
          </WalletProvider>
        </ToastProvider>
      </LangProvider>,
    );
    expect(screen.getByRole("heading", { name: "บันทึกการเลี้ยง" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "เชื่อมกระเป๋า" })).toBeTruthy();
  });
});
