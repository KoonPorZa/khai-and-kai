# rwa-app-bnb

A clean-room build for the BNB Bangkok hackathon, Developer Track: real chickens (farm / ornamental, not fighting birds) as on-chain assets on **BNB Smart Chain testnet (chain 97)**. Egg → hatch → care. Submission closes **27 Nov 2026, 09:00 (UTC+7)**.

`SPEC.md` is the source of truth for what to build. Private planning notes live in `docs/bnb/` (git-ignored); read `docs/bnb/HANDOFF.md` first if it exists on this machine.

## Rules for this repo

- Testnet only. Never configure BSC mainnet (56) or any mainnet key.
- No backend: contracts plus a static web app. Hatch randomness is on-chain commit–reveal.
- Own brand, own design, own art. Do not copy code, names, logos, photos or copy text from any earlier project. The earlier Solana demo may be read for flows and business rules only.
- This repo is meant to become public. Never commit secrets, private keys, `.env` files or anything under `docs/bnb/`.
- Do not make the repo public, deploy, or push anywhere without the owner's go-ahead.
- Gitflow: work on `develop` or `feature/*`; `main` is the release branch.
