// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, toBytes } from "viem";
import { DEPLOYMENT, FARM, ME, ZERO, actions, reset, state } from "./wagmiMock";

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

import { App } from "../src/App";

const ETH = 10n ** 18n;
const birdOf = (breed: number, sex: number, plumage: number) => ({ breed, sex, plumage, bornAt: 1_790_000_000n, recordHash: `0x${"00".repeat(32)}` });
const chickenOf = (tokenId: bigint, owner: string, paidUntilOffset: number, extra: object = {}) => ({
  tokenId,
  owner,
  bird: birdOf(0, 0, 0),
  carePaidUntil: state.blockTimestamp + BigInt(paidUntilOffset),
  hatchId: 4n,
  proofCount: 0n,
  ...extra,
});

/** The parameters of the first writeContract call. */
const firstWrite = () => (actions.writeContract.mock.calls[0] as unknown as [unknown, unknown])[1];

function show(path: string, locationState?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state: locationState }]}>
      <App />
    </MemoryRouter>,
  );
}

/** Reads that every page needs when the contracts are deployed. */
function deployedBasics() {
  Object.assign(state.reads, {
    price: () => ETH / 100n,
    dailyLimit: () => 3n,
    eggsAvailable: () => 7n,
    remainingToday: () => 3n,
    boughtToday: () => 0n,
    paused: () => false,
    careFee: () => ETH / 1000n,
    carePeriod: () => 3600n,
    MAX_CARE_PERIODS: () => 8760n,
    FARM_ROLE: () => `0x${"11".repeat(32)}`,
    hasRole: () => false,
    stats: () => ({ birdsRegistered: 30n, poolSize: 26n, hatched: 3n, pendingHatches: 1n, careProofs: 5n }),
    tokenByIndex: ([i]: readonly unknown[]) => [4n, 9n, 12n][Number(i)],
  });
}

beforeEach(() => {
  reset();
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  window.scrollTo = (() => undefined) as never;
});
afterEach(cleanup);

describe("not deployed on testnet", () => {
  it("shows the banner and keeps actions disabled", () => {
    state.deployed = false;
    state.account = { address: ME, chainId: 97 };
    show("/eggs");
    expect(screen.getByText(/Contracts are not deployed on BNB testnet yet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Buy and hatch now" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Buy 1 egg/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("still renders the home page and the footer note", () => {
    state.deployed = false;
    show("/");
    expect(screen.getByText(/Contracts are not deployed on BNB testnet yet/)).toBeTruthy();
    expect(screen.getByText(/The grid appears after the contracts are deployed/)).toBeTruthy();
    expect(screen.getByText(/Contract addresses appear here after the testnet deploy/)).toBeTruthy();
  });
});

describe("wallet and network", () => {
  it("offers to switch when the wallet is on another chain", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 1 };
    show("/eggs");
    expect(screen.getAllByText("Wrong network").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Switch to BNB testnet/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Buy and hatch now" })).toBeNull();
  });

  it("shows the address pill, balance and disconnect in the menu", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    show("/");
    fireEvent.click(screen.getByRole("button", { name: /0x7099/ }));
    expect(screen.getByText(/5 tBNB/)).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Disconnect" })).toBeTruthy();
  });
});

describe("home", () => {
  it("lights sponsored birds, marks hatching ones, and links the explorer and GitHub", () => {
    deployedBasics();
    const { container } = show("/");
    expect(container.querySelectorAll(".cell-lit")).toHaveLength(3);
    expect(container.querySelectorAll(".cell-hatch")).toHaveLength(1);
    expect(container.querySelectorAll(".cell-dark")).toHaveLength(26);
    expect(screen.getByLabelText("Open chicken KK-0009")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Source on GitHub/ }).getAttribute("href")).toBe("https://github.com/KoonPorZa/khai-and-kai");
    const kai = screen.getByRole("link", { name: /^Kai 0x/ });
    expect(kai.getAttribute("href")).toBe(`https://testnet.bscscan.com/address/${DEPLOYMENT.kai}`);
    expect(screen.getByText(/Sponsorship is not legal ownership/)).toBeTruthy();
  });
});

describe("eggs", () => {
  it("shows price, eggs left and quota pips, and buys with the right call", async () => {
    deployedBasics();
    state.reads.boughtToday = () => 1n;
    state.reads.remainingToday = () => 2n;
    state.account = { address: ME, chainId: 97 };
    show("/eggs");
    expect(screen.getByText("0.01")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText(/1 of 3 used/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(screen.getByRole("button", { name: "Buy 2 eggs" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buy and hatch now" }));
    await waitFor(() => expect(actions.writeContract).toHaveBeenCalled());
    expect(firstWrite()).toMatchObject({ functionName: "buyAndStartHatch", value: ETH / 100n, address: DEPLOYMENT.khai });
  });

  it("explains a used-up daily quota and a sold-out coop", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    state.reads.remainingToday = () => 0n;
    state.reads.boughtToday = () => 3n;
    show("/eggs");
    expect(screen.getByText(/You have used all 3 eggs for today/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Buy and hatch now" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    state.reads.remainingToday = () => 3n;
    state.reads.eggsAvailable = () => 0n;
    show("/eggs");
    expect(screen.getByText(/Every egg is spoken for/)).toBeTruthy();
  });
});

describe("my coop", () => {
  it("asks for a wallet when disconnected", () => {
    deployedBasics();
    show("/coop");
    expect(screen.getByText(/Connect a wallet to see your eggs/)).toBeTruthy();
  });

  it("lists eggs, a pending hatch and chickens with their care status", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    Object.assign(state.reads, {
      balanceOf: () => 2n,
      hatchesOf: () => [5n],
      hatch: () => ({ owner: ME, revealBlock: 990n, birdId: 0, usedFallback: false }),
      chickensOf: () => [chickenOf(4n, ME, 1800), chickenOf(9n, ME, -600)],
    });
    show("/coop");
    expect(screen.getByText("2 eggs waiting")).toBeTruthy();
    expect(screen.getByText("Hatch #5 is ready to reveal")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reveal" }).getAttribute("href")).toBe("/hatch/5");
    expect(screen.getByText(/Care paid, 30 minutes left/)).toBeTruthy();
    expect(screen.getByText(/Care overdue 10 minutes/)).toBeTruthy();
    expect(screen.getByText(/can't be transferred/)).toBeTruthy();
  });

  it("shows the empty state", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    Object.assign(state.reads, { balanceOf: () => 0n, hatchesOf: () => [], chickensOf: () => [] });
    show("/coop");
    expect(screen.getByText("Your coop is empty")).toBeTruthy();
  });
});

describe("chicken page", () => {
  const proof = ["0x" + "22".repeat(32), 26n, 7n] as const;
  function withChicken(offset: number, hatchExtra: object = {}) {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    Object.assign(state.reads, {
      chicken: () => chickenOf(4n, ME, offset, { proofCount: 2n }),
      hatch: () => ({ owner: ME, revealBlock: 900n, birdId: 4, usedFallback: false, ...hatchExtra }),
      hatchProof: () => proof,
      tokenURI: () => "data:application/json;base64,e30=",
      careProofs: () => [
        { at: state.blockTimestamp - 100n, kind: 0, contentHash: `0x${"aa".repeat(32)}`, note: "Morning feeding" },
        { at: state.blockTimestamp - 9000n, kind: 3, contentHash: `0x${"bb".repeat(32)}`, note: "Vaccinated" },
      ],
    });
  }

  it("shows an active chicken with traits, care countdown, the pay selector and the timeline", () => {
    withChicken(2520);
    show("/chicken/4");
    expect(screen.getByRole("heading", { name: "Silkie hen" })).toBeTruthy();
    expect(screen.getByText("KK-0004")).toBeTruthy();
    expect(screen.getByText("Care is paid")).toBeTruthy();
    expect(screen.getByText(/42 minutes left/)).toBeTruthy();
    const options = within(screen.getByLabelText("Add")).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByText("Morning feeding")).toBeTruthy();
    expect(screen.getByText("Vaccinated")).toBeTruthy();
    expect(screen.getByText(/Breed illustration|Drawn from its traits/)).toBeTruthy();
  });

  it("caps the periods the selector offers at MAX_CARE_PERIODS", () => {
    withChicken(2520);
    state.reads.MAX_CARE_PERIODS = () => 3n;
    show("/chicken/4");
    expect(within(screen.getByLabelText("Add")).getAllByRole("option")).toHaveLength(2);
  });

  it("shows the overdue state and pays one period with the right value", async () => {
    withChicken(-900);
    show("/chicken/4");
    expect(screen.getByText(/Care is 15 minutes overdue/)).toBeTruthy();
    expect(screen.getByText("Transfers are locked until care is paid.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Pay 1 period, 0.001 tBNB/ }));
    await waitFor(() => expect(actions.writeContract).toHaveBeenCalled());
    expect(firstWrite()).toMatchObject({ functionName: "payCare", args: [4n, 1n], value: ETH / 1000n });
  });

  it("explains what Check the draw proves, and runs it", async () => {
    withChicken(2520);
    show("/chicken/4");
    expect(screen.getByText("How this bird was drawn")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check the draw" }));
    // The mocked block hash cannot reproduce the recorded seed, so the page reports a mismatch instead of a pass.
    await waitFor(() => expect(screen.getByText(/does not match the contract/)).toBeTruthy());
  });

  it("labels a fallback hatch", () => {
    withChicken(2520, { usedFallback: true });
    show("/chicken/4");
    expect(screen.getByText(/Fallback draw/)).toBeTruthy();
  });

  it("says a bird without a sponsor is waiting, and rejects a bad band number", () => {
    deployedBasics();
    state.reads.chicken = () => {
      throw new Error("ERC721NonexistentToken");
    };
    show("/chicken/17");
    expect(screen.getByText(/has no sponsor yet/)).toBeTruthy();
    cleanup();
    show("/chicken/abc");
    expect(screen.getByText("Chicken not found")).toBeTruthy();
  });
});

describe("hatch page", () => {
  it("waits for the reveal block, then offers the second confirmation", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    state.reads.hatch = () => ({ owner: ME, revealBlock: 1002n, birdId: 0, usedFallback: false });
    state.reads.hatchProof = () => [`0x${"00".repeat(32)}`, 0n, 0n];
    state.blockNumber = 1001n;
    show("/hatch/5");
    expect(screen.getByText("Something is moving in there")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm reveal in wallet" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    state.blockNumber = 1003n;
    show("/hatch/5");
    expect(screen.getByText("Your egg is ready")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm reveal in wallet" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reveals with a padded gas estimate because earlier hatches may finish in the same call", async () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    state.reads.hatch = () => ({ owner: ME, revealBlock: 1002n, birdId: 0, usedFallback: false });
    state.reads.hatchProof = () => [`0x${"00".repeat(32)}`, 0n, 0n];
    state.blockNumber = 1003n;
    show("/hatch/5");
    expect(actions.writeContract).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm reveal in wallet" }));
    await waitFor(() => expect(actions.writeContract).toHaveBeenCalled());
    expect(firstWrite()).toMatchObject({ functionName: "finishHatch", args: [5n], gas: 130_000n });
  });

  it("opens the second confirmation by itself for a hatch the user just started", async () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    state.reads.hatch = () => ({ owner: ME, revealBlock: 1002n, birdId: 0, usedFallback: false });
    state.reads.hatchProof = () => [`0x${"00".repeat(32)}`, 0n, 0n];
    state.blockNumber = 1003n;
    show("/hatch/5", { fresh: true });
    await waitFor(() => expect(actions.writeContract).toHaveBeenCalledTimes(1));
    expect(firstWrite()).toMatchObject({ functionName: "finishHatch", args: [5n] });
  });

  it("shows a finished hatch with its chicken and the draw summary", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    state.reads.hatch = () => ({ owner: ME, revealBlock: 900n, birdId: 4, usedFallback: false });
    state.reads.hatchProof = () => ["0x" + "22".repeat(32), 26n, 7n];
    state.reads.chicken = () => chickenOf(4n, ME, 3000);
    show("/hatch/5");
    expect(screen.getByText("You are now the sponsor of")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Meet your chicken" }).getAttribute("href")).toBe("/chicken/4");
    expect(screen.getByText(/bird 8 of 26 waiting/)).toBeTruthy();
  });

  it("handles a hatch that does not exist", () => {
    deployedBasics();
    state.reads.hatch = () => ({ owner: ZERO, revealBlock: 0n, birdId: 0, usedFallback: false });
    state.reads.hatchProof = () => [`0x${"00".repeat(32)}`, 0n, 0n];
    show("/hatch/99");
    expect(screen.getByText("There is no hatch with this number.")).toBeTruthy();
  });
});

describe("farm page", () => {
  it("is closed to other wallets", () => {
    deployedBasics();
    state.account = { address: ME, chainId: 97 };
    show("/farm");
    expect(screen.getByText("This page is for the farm account.")).toBeTruthy();
  });

  it("shows the form to the farm wallet, fingerprints the record, and limits the note to 140 bytes", async () => {
    deployedBasics();
    state.reads.hasRole = () => true;
    state.account = { address: FARM, chainId: 97 };
    state.reads.chicken = () => chickenOf(42n, ME, 3000);
    show("/farm");
    fireEvent.change(screen.getByLabelText("Bird"), { target: { value: "KK-0042" } });
    fireEvent.change(screen.getByLabelText("Farm record to fingerprint"), { target: { value: "Weighed 1.9 kg" } });
    expect(screen.getByText(keccak256(toBytes("Weighed 1.9 kg")))).toBeTruthy();
    const note = screen.getByLabelText("Note for the sponsor");
    fireEvent.change(note, { target: { value: "x".repeat(141) } });
    expect(screen.getByText(/limited to 140 bytes/)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Post care record" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(note, { target: { value: "Weight check" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(actions.writeContract).toHaveBeenCalled());
    expect(firstWrite()).toMatchObject({
      functionName: "postCareProof",
      args: [42n, 1, keccak256(toBytes("Weighed 1.9 kg")), "Weight check"],
    });
  });
});
