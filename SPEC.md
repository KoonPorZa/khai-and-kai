# SPEC — Khai & Kai

> **Khai (ไข่) = egg · Kai (ไก่) = chicken.** Sponsor a real farm chicken on BNB Smart Chain.
> **Status:** agreed with the owner, 26 Nov 2026. This file is the source of truth.
> **Deadline:** submit by 27 Nov 2026, 09:00 (UTC+7), BNB Bangkok hackathon, Developer Track (RWA theme).

## 1. Goal

A small, fully on-chain protocol that links one real farm chicken to one NFT and keeps the bird's care visible and paid for on-chain.

1. A farm registers real birds on-chain.
2. A user buys an **egg** (Khai), then **hatches** it to become the sponsor of one registered bird, drawn at random, and receives its **chicken** NFT (Kai).
3. The sponsor pays a recurring **care fee**; the farm posts **care proofs** against the bird. A chicken with overdue care cannot be transferred.
4. The sponsorship ends in one of three ways: the sponsor **collects** the real bird and keeps the token as its record, **passes** the token on with the full record, or stops paying and the farm **returns the bird to the coop** for a new sponsor.

There is no backend and no database. Contracts hold all state; the web app is static files that talk to the chain through the user's wallet and a public RPC.

**Framing: sponsorship, not ownership.** The NFT proves you are the sponsor of that bird: you fund its care and see every care record. The sponsor can collect the real bird (section 4.6); a legal sponsorship or ownership agreement behind the token is a roadmap item. Farm and ornamental chickens only: no fighting, no betting, no rarity tiers, no value linked to any contest.

## 2. Glossary

| Term | Meaning |
| --- | --- |
| Farm | The operator address that registers birds, posts care proofs and withdraws payments |
| Bird | A real chicken registered by the farm, with fixed traits. Bird ids start at 1 |
| Pool | Registered birds that have no sponsor yet |
| Egg / Khai | ERC-1155 token id 1. A claim on one random bird from the pool |
| Chicken / Kai | ERC-721 token. `tokenId == birdId`, so a bird can back only one token |
| Hatch | Two-step process (start, finish) that turns an egg into a chicken |
| Care period | Time covered by one care fee. 30 days in production, 1 hour on testnet |

The UI calls things **Egg** and **Chicken**. Khai and Kai are the brand and the collection names.

## 3. Users

- **Sponsor:** connects an EVM wallet (the wallet is the account), buys eggs, hatches, pays care, views their chickens.
- **Farm operator:** one address holding `FARM_ROLE` (the deployer on testnet). Registers birds and withdraws by script; posts care proofs from the web app.
- **Anyone:** can read every bird, hatch and care record, finish any pending hatch, and pay care for any chicken.

## 4. Flows

### 4.1 Connect
1. Injected wallets (MetaMask, Rabby, Trust, Binance Wallet).
2. Wrong network: the app offers to switch to or add chain 97.
3. All public pages work read-only with no wallet.

### 4.2 Get an egg
- **Buy and hatch (default button):** `Khai.buyAndStartHatch()` with `msg.value = price`. No egg token is minted; a hatch starts for the caller. One wallet confirmation.
- **Buy to keep:** `Khai.buy(qty)` with `msg.value = price × qty` mints eggs. Eggs are transferable.
- Limits: 20 eggs per wallet per UTC day (both paths count); eggs can never be sold beyond the pool (invariant I1).

### 4.3 Hatch (commit–reveal)
1. `Kai.startHatch()` burns one of the caller's eggs (or the buy-and-hatch path does the same without an egg). It records `revealBlock = block.number + 2` and reserves one bird's worth of pool capacity.
2. Once `block.number > revealBlock`, anyone calls `Kai.finishHatch(hatchId)`. Seed = `keccak256(blockhash(revealBlock), hatchId)`. `index = seed % pool.length`; that bird leaves the pool (swap-remove) and its token is minted to the hatch's owner. **Hatches finish strictly in hatch-id order:** `finishHatch(id)` first finishes every earlier pending hatch, and `finishNext(maxCount)` advances the queue in bounded gas. Finish order therefore cannot change which bird a hatch gets.
3. The web app sends step 2 automatically about 1.5 s after step 1 confirms (block time is about 0.45 s) and plays the hatch animation in between. A new user confirms twice in total.
4. `blockhash` covers only the last 256 blocks (about 2 minutes). After that, `finishHatch` uses `keccak256(hatchId, revealBlock)` instead and marks the hatch as `fallback`.
5. The chicken page shows the hatch record and a **Check the draw** button that recomputes the seed and the pool position in the browser from the block hash (`hatchProof(hatchId)` gives the stored seed, pool size and position to compare with). It checks that the seed and pool position recomputed in the browser from the reveal block's hash (read from two RPC endpoints that must agree) match what the contract stored; for a fallback hatch the seed comes from the hatch number because the block hash had expired. It does not prove the finisher had no say: they could see the block hash before finishing. Which bird sat at that position is contract state at that block, visible to an archive node.

Stated limitation: a caller can see the block hash before finishing and could choose to wait for the fallback, and a block producer can influence a block hash. With no tiers there is no better or worse bird, so this is accepted on testnet. Production uses a VRF.

### 4.4 Care
1. Each chicken has `carePaidUntil`. Hatching includes the first period.
2. `Kai.payCare(tokenId, periods)` with `msg.value = careFee × periods` sets `carePaidUntil = max(now, carePaidUntil) + periods × carePeriod`. Anyone can pay.
3. Status: **Active** while `now ≤ carePaidUntil`, otherwise **Overdue**.
4. **An overdue chicken cannot be transferred** until care is paid. Minting is not affected.
5. The farm calls `Kai.postCareProof(tokenId, kind, contentHash, note)`. Kinds: 0 Feeding, 1 Health check, 2 Weight, 3 Vaccination, 4 Photo, 5 Note. `note` is a short text (max 140 bytes); `contentHash` is the hash of the farm's off-chain record. Proofs are stored on-chain and shown as a timeline.

### 4.5 Farm
- Web: one form, post a care proof (visible only to an address with `FARM_ROLE`).
- Scripts: register birds, withdraw, set price, set care fee, pause.

### 4.6 Collect the bird (redeem)
1. The token owner calls `Kai.requestRedeem(tokenId)`. Care must not be overdue. While a request is pending the token cannot be transferred. The owner can call `cancelRedeem(tokenId)`, and the farm can refuse with `declineRedeem(tokenId)` (the request is cleared; the normal rules apply again).
2. The farm hands the bird over and calls `Kai.confirmRedeem(tokenId, handoverHash)` (hash of the farm's handover record).
3. The token stays with its owner as the bird's permanent record: status **Collected**. From then on there is no care fee, no overdue state, no new care proofs and no release; the token can be transferred freely, so the record travels with the bird. The bird never returns to the pool.
4. The care clock keeps running while a request is pending. The farm may refuse by not confirming; that is an off-chain matter.

### 4.7 Return to the coop (release)
1. When care has been overdue for more than 3 full care periods (`block.timestamp > carePaidUntil + 3 × carePeriod`), the farm may call `Kai.release(tokenId)`.
2. `release` reverts `RedeemPending` while a collection request is pending: the farm must confirm or decline it first, so release never wipes a request. The token is then burned and the bird goes back into the pool, so a new sponsor can hatch it. Its care proofs stay with the bird (they are keyed by bird id), so the next sponsor sees the full history.
3. Paying care at any time before the farm calls `release` removes the risk. A collected bird cannot be released.

## 5. Architecture

```
contracts/   Hardhat, Solidity 0.8.26 (evmVersion cancun), OpenZeppelin Contracts 5
  Khai.sol          ERC-1155 egg, sale, daily quota
  Kai.sol           ERC-721 Enumerable, bird registry, pool, hatch, care, transfer lock
  KaiRenderer.sol   on-chain SVG + JSON metadata for both tokens (replaceable by the admin)
  scripts/          deploy, seed birds, farm admin
web/         Vite + React + TypeScript, wagmi + viem, static build
  public/art/       generated illustrations
```

- **No `eth_getLogs`.** The official BSC testnet RPCs reject log queries, so every screen reads view functions. Events are still emitted for explorers.
- **Token art is on-chain.** `tokenURI` / `uri` return base64 JSON with an SVG drawn from the bird's traits. NFTs never depend on our hosting.
- **Web art is generated illustration** (logo, hero, egg and hatch scene, one portrait per breed, empty states, social preview). The chicken page shows the breed portrait as the main image and the on-chain SVG labelled "on-chain token art".
- Contracts verified on Sourcify. Web hosted on Cloudflare Workers static assets.

### Traits

`Bird { uint8 breed; uint8 sex; uint8 plumage; uint40 bornAt; bytes32 recordHash }`

| Field | Values |
| --- | --- |
| `breed` | 0 Silkie, 1 Brahma, 2 Serama, 3 Polish, 4 Cochin, 5 Sebright, 6 Orpington, 7 Wyandotte, 8 Leghorn, 9 Sussex |
| `sex` | 0 Hen, 1 Rooster |
| `plumage` | 0 White, 1 Black, 2 Buff, 3 Blue, 4 Splash, 5 Partridge, 6 Silver, 7 Gold |
| `bornAt` | Unix seconds |
| `recordHash` | Hash of the farm's paper record |

Leg-band id is derived, not stored: `KK-` + bird id padded to 4 digits. The seed set is **300 invented sample birds**, labelled as sample data in the web app and the README.

## 6. Contract interface

This is the ABI the web app is built against. Names and types are fixed.

```solidity
// ---------- Khai (ERC-1155, id EGG = 1) ----------
uint256 constant EGG = 1;
function price() view returns (uint256);
function dailyLimit() view returns (uint256);
function kai() view returns (address);
function buy(uint256 qty) payable;                       // WrongPayment, DailyLimit, SoldOut, ZeroQuantity
function buyAndStartHatch() payable returns (uint256 hatchId);
function boughtToday(address who) view returns (uint256);
function remainingToday(address who) view returns (uint256);
function eggsAvailable() view returns (uint256);         // pool − pending hatches − eggs outstanding
function totalSupply(uint256 id) view returns (uint256);
function burnForHatch(address from);                     // only Kai
function setKai(address kai);                            // admin, once
function setPrice(uint256), setDailyLimit(uint256), pause(), unpause();   // admin
function withdraw(address payable to);                   // FARM_ROLE, whole balance
event EggsBought(address indexed buyer, uint256 qty, uint256 paid);

// ---------- Kai (ERC-721 Enumerable) ----------
struct Bird      { uint8 breed; uint8 sex; uint8 plumage; uint40 bornAt; bytes32 recordHash; }
struct Hatch     { address owner; uint64 revealBlock; uint32 birdId; bool usedFallback; }  // birdId 0 = pending
struct CareProof { uint64 at; uint8 kind; bytes32 contentHash; string note; }
struct Chicken   { uint256 tokenId; address owner; Bird bird; uint64 carePaidUntil; uint256 hatchId; uint256 proofCount; }
struct Stats     { uint256 birdsRegistered; uint256 poolSize; uint256 hatched; uint256 pendingHatches; uint256 careProofs; }

function careFee() view returns (uint256);
function carePeriod() view returns (uint64);             // immutable, seconds
function registerBirds(Bird[] calldata birds);           // FARM_ROLE
function startHatch() returns (uint256 hatchId);         // burns 1 egg of msg.sender
function startHatchFor(address owner) returns (uint256 hatchId);   // only Khai
function finishHatch(uint256 hatchId) returns (uint256 tokenId);   // anyone; finishes earlier pending hatches first; TooEarly, AlreadyFinished
function finishNext(uint256 maxCount) returns (uint256 finished);  // anyone; advances the FIFO queue
function nextHatchToFinish() view returns (uint256);
function hatchProof(uint256 hatchId) view returns (bytes32 seed, uint256 poolSizeAtFinish, uint256 index);
function payCare(uint256 tokenId, uint256 periods) payable;        // WrongPayment, ZeroQuantity
function postCareProof(uint256 tokenId, uint8 kind, bytes32 contentHash, string calldata note);  // FARM_ROLE
function isOverdue(uint256 tokenId) view returns (bool);
function bird(uint256 birdId) view returns (Bird memory);
function chicken(uint256 tokenId) view returns (Chicken memory);
function chickensOf(address owner) view returns (Chicken[] memory);
function hatch(uint256 hatchId) view returns (Hatch memory);
function hatchesOf(address owner) view returns (uint256[] memory);           // hatch ids, oldest first
function careProofs(uint256 tokenId, uint256 offset, uint256 limit) view returns (CareProof[] memory);  // newest first
function poolSize() view returns (uint256);
function pendingHatches() view returns (uint256);
function stats() view returns (Stats memory);
function setCareFee(uint256), setRenderer(address), pause(), unpause();      // admin
function withdraw(address payable to);                   // FARM_ROLE, whole balance
event BirdsRegistered(uint256 firstBirdId, uint256 count);
event HatchStarted(uint256 indexed hatchId, address indexed owner, uint64 revealBlock);
event HatchFinished(uint256 indexed hatchId, address indexed owner, uint256 indexed tokenId, bytes32 seed, bool usedFallback);
event CarePaid(uint256 indexed tokenId, address indexed payer, uint256 periods, uint64 carePaidUntil);
event CareProofPosted(uint256 indexed tokenId, uint8 kind, bytes32 contentHash, string note);
// transfer of an overdue token reverts CareOverdue(tokenId)

// ---------- Kai: redeem and release ----------
uint256 constant RELEASE_AFTER_PERIODS = 3;
function requestRedeem(uint256 tokenId);                 // owner; NotTokenOwner, CareOverdue, RedeemPending, AlreadyRedeemed
function cancelRedeem(uint256 tokenId);                  // owner; NoRedeemRequest
function confirmRedeem(uint256 tokenId, bytes32 handoverHash);   // FARM_ROLE; NoRedeemRequest
function declineRedeem(uint256 tokenId);                 // FARM_ROLE; NoRedeemRequest
function release(uint256 tokenId);                       // FARM_ROLE; NotReleasable, AlreadyRedeemed, RedeemPending
function releasableAt(uint256 tokenId) view returns (uint64);    // carePaidUntil + 3 × carePeriod; 0 if collected or no token
function isReleasable(uint256 tokenId) view returns (bool);
function pendingRedeems() view returns (uint256[] memory);       // token ids with a pending request
// struct Chicken gains: uint64 redeemRequestedAt; uint64 redeemedAt;
// struct Stats gains: uint256 collected; uint256 released; uint256 hatchCount;   (hatched = live tokens; hatchCount = hatches ever finished)
// KaiRenderer.chickenURI gains a `uint64 redeemedAt` argument; the "Care status" attribute reads Paid, Overdue or Collected
event RedeemRequested(uint256 indexed tokenId, address indexed owner);
event RedeemCancelled(uint256 indexed tokenId, address indexed owner);
event Redeemed(uint256 indexed tokenId, address indexed owner, bytes32 handoverHash);
event RedeemDeclined(uint256 indexed tokenId, address indexed owner);
event Released(uint256 indexed tokenId, address indexed previousOwner);
// transfer while a redeem request is pending reverts RedeemPending(tokenId); payCare and postCareProof on a collected token revert AlreadyRedeemed(tokenId)

// ---------- KaiRenderer ----------
function chickenURI(uint256 tokenId, Kai.Bird calldata bird, uint64 carePaidUntil) view returns (string memory);
function eggURI() view returns (string memory);
function breedName(uint8) pure returns (string memory); function plumageName(uint8) pure returns (string memory);
```

Roles (OpenZeppelin `AccessControl`, on both Khai and Kai): `DEFAULT_ADMIN_ROLE`, `FARM_ROLE`. The constructors take `admin` and `farm` addresses; on testnet both are the deployer.

**Testnet parameters:** egg price 0.001 tBNB · care fee 0.001 tBNB · care period 3600 s · daily limit 20 · hatch delay 2 blocks. (Deployed with price 0.01 and limit 3; the owner changed both on 26 Nov 2026 with `setPrice` and `setDailyLimit` so visitors can try more hatches.)

## 7. Invariants (each needs a test)

- **I1** `Khai.totalSupply(EGG) + Kai.pendingHatches() ≤ Kai.poolSize()`. Every egg and every pending hatch can always finish.
- **I2** `tokenId == birdId`. A bird is either in the pool or backs exactly one live token, never both and never two tokens. It leaves the pool once per sponsorship (it can return only through release, I9).
- **I3** A hatch finishes at most once. Its seed depends only on `hatchId`, `revealBlock` and that block's hash.
- **I4** The daily quota holds across `buy` and `buyAndStartHatch`, and across split purchases.
- **I5** Each contract's balance equals payments received minus withdrawals; only `FARM_ROLE` withdraws.
- **I6** Only Kai burns eggs for hatching; only Khai calls `startHatchFor`; only `FARM_ROLE` registers birds and posts proofs.
- **I7** A token cannot be transferred while overdue, and can be again once care is paid.
- **I8** Redeem: only the owner can request or cancel, only `FARM_ROLE` can confirm, and only a pending request can be confirmed. A pending request blocks transfers. A collected token has no care fee, cannot be released, cannot receive care proofs, and its bird is never in the pool.
- **I9** Release: only `FARM_ROLE`, only after more than 3 overdue periods, never for a collected token. After release the token does not exist, the bird is in the pool exactly once, and I1 still holds. A released bird can be hatched again and gets the same token id.

## 8. Web app

| Route | Content |
| --- | --- |
| `/` | What it is, live counters from `stats()`, how it works in three steps, call to action |
| `/eggs` | Price, eggs left, today's quota, "Buy and hatch" and "Buy to keep" |
| `/coop` | My eggs (hatch), pending hatches (finish), my chickens with care status |
| `/chicken/:id` | Breed portrait, on-chain token art, traits, band id, hatch record + Check the draw, care status, pay care, care timeline, collect the bird (request, cancel, collected state), and when overdue the time after which the farm may return it to the coop |
| `/farm` | Farm address only: post a care proof, confirm collection requests, return long-overdue birds to the coop |

**Design: "Night Coop".** Dark only. Tokens: background `#0e1116`, surface `#161b23`, line `#262c36`, text `#f2f4f7`, muted `#8c95a3`, accent (BNB yellow) `#f0b90b`, violet `#7c5cff`, mint (ok) `#4fe3a1`, coral (overdue) `#ff7a6b`. Display face Space Grotesk, body Inter, numbers and addresses IBM Plex Mono, Thai glyphs ไข่ / ไก่ as a logo element (Noto Sans Thai). Mobile first, English UI. The on-chain SVG uses the same palette. Reference mock: the "C · Night Coop" board the owner picked.

## 9. Security

- Testnet only: the production web build and the deploy scripts refuse any chain id other than 97. Local development may use a Hardhat node (31337) behind an explicit dev flag.
- Deployer / farm key lives in a git-ignored `.env`, mode 600. It is a testnet-only wallet.
- Reentrancy guard and checks-effects-interactions on payable and minting paths; pull payments.
- gitleaks over the tree and every commit before the repo is made public.

## 10. Phases

**Phase 1 — RWA (must finish):** everything above.

**Phase 2 — only if time is left, in this order:**
1. Breeding: a collected or sponsored bird's own eggs enter the system as new eggs that record their parents.
2. Show results recorded on the bird's record (no betting, no fight results).
3. AI agent that reads care proofs and flags gaps (the track's second theme).

Redeem (4.6) and release (4.7) moved into phase 1 on 26 Nov 2026 at the owner's request, to close the loop: egg → chicken → collect, pass on, or return to the coop.

**Out of scope:** marketplace, auctions, mainnet, stablecoins, KYC, VRF, multiple farms, light theme, Thai UI, any backend.

## 11. Acceptance criteria

- [ ] Contracts deployed and verified on chain 97; addresses in the README
- [ ] I1–I7 covered by passing tests
- [ ] A new wallet can connect, buy and hatch with two confirmations, and see the chicken in the app and in the explorer with its on-chain art
- [ ] An egg beyond the daily limit is rejected with a clear message
- [ ] Check the draw recomputes the same seed and pool position from the block hash
- [ ] A hatch left past 256 blocks still finishes, marked as fallback
- [ ] Care can be paid; an overdue chicken shows Overdue and cannot be transferred; a posted care proof appears on the timeline
- [ ] The app works read-only with no wallet and makes no `eth_getLogs` call
- [ ] Web typecheck, lint, tests and static build pass
- [ ] README: what, why, how to run, demo steps, addresses, limitations, prior work, roadmap. MIT licence. 2–3 minute demo video

## 12. README "Prior work" (agreed wording, in substance)

The team explored the egg-to-chicken idea in a Solana devnet demo in October 2026. This repository was written from scratch during the hackathon and shares no code, art or data with it. New here: birds are drawn without replacement (one bird, one token), the draw runs on-chain, care fees and the transfer lock are on-chain, and there is no backend.

## 13. Stop points

Work proceeds without check-ins except before: deploying contracts to chain 97 (needs tBNB from the owner), deploying the web app, and pushing or making the repository public.
