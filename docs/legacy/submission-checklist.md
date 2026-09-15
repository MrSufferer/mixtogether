# MixTogether submission checklist

Last updated: 2026-09-05.

## Product and implementation

- [x] MixTogether branding, primary tagline, and privacy-literate copy.
- [x] Sepolia-only Vite React dashboard with explicit reveal.
- [x] Official cUSDC faucet → exact approval → shield → confidential deposit flow.
- [x] Confidential pool with separate principal, reserve, and winnings ledgers.
- [x] Fixed five-minute, one-winner, 64-saver, eight-slot draw lifecycle.
- [x] Claims and withdrawals available in every draw phase.
- [x] Pending public unwrap persistence and event rediscovery.
- [x] Permissionless keeper CLI.

## Verification

- [x] Solidity compile and TypeScript typecheck.
- [x] Contract suite, including encrypted-zero and eight-saver batch coverage.
- [x] Web unit suite.
- [x] Desktop/mobile Playwright gate and reviewed screenshots.
- [x] Production web build.
- [x] Production-only dependency audit (`pnpm audit --prod`) with no known vulnerabilities.
- [x] Live token/wrapper/registry/faucet preflight on Sepolia.
- [x] Real Sepolia eight-saver HCU smoke after pool deployment.
- [x] Two-wallet deployed walkthrough and encrypted claim/withdraw verification.
- [ ] Etherscan source verification.
- [ ] Independent audit.

## Release

- [x] Public Vercel preview: https://web-e9stkxv3e-gadillacers-projects.vercel.app
- [x] COOP/COEP and baseline security headers verified.
- [x] README, architecture, security policy, demo script, X thread, and MIT license.
- [x] CI workflow.
- [x] Deploy `MixTogetherPool` from a funded non-test Sepolia signer (`0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97`).
- [x] Fund the pool’s confidential prize reserve (100 cUSDC via `confidentialTransferAndCall`).
- [x] Configure `VITE_POOL_ADDRESS` and publish a transaction-enabled web deployment (https://web-e9stkxv3e-gadillacers-projects.vercel.app).
- [x] Create public GitHub repository `MrSufferer/mixtogether`, push, and confirm public visibility.
- [ ] Record and upload the demo video.
- [ ] Replace preview/noindex URL with the final production URL in release collateral.

## Current blockers

- None for code, deployment, preview, or onchain smoke: pool is live, funded, with 8-slot HCU receipts and 2-wallet walkthrough.
- Remaining release collateral: Etherscan source + constructor verification, demo video recording, production URL/`noindex` replacement, and independent security audit.
