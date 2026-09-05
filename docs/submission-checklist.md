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
- [ ] Real Sepolia eight-saver HCU smoke after pool deployment.
- [ ] Two-wallet deployed walkthrough and encrypted claim/withdraw verification.
- [ ] Etherscan source verification.
- [ ] Independent audit.

## Release

- [x] Public Vercel preview: https://web-5wg8kthck-gadillacers-projects.vercel.app
- [x] COOP/COEP and baseline security headers verified.
- [x] README, architecture, security policy, demo script, X thread, and MIT license.
- [x] CI workflow.
- [ ] Deploy `MixTogetherPool` from a funded non-test Sepolia signer.
- [ ] Fund the pool’s confidential prize reserve.
- [ ] Configure `VITE_POOL_ADDRESS` and publish a transaction-enabled web deployment.
- [x] Create public GitHub repository `MrSufferer/mixtogether`, push, and confirm public visibility.
- [ ] Record and upload the demo video.
- [ ] Replace preview/noindex URL with the final production URL in release collateral.

## Current blockers

- `DEPLOYER_PRIVATE_KEY` is not yet populated in the gitignored `.env` file, so Sepolia deployment was not attempted. Live-network configuration intentionally fails closed with empty accounts rather than using Hardhat's public test mnemonic.
The Vercel preview is deliberately transaction-disabled until the contract deployment and post-deployment smoke checks are complete.
