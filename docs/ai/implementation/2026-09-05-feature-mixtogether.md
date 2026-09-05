---
phase: implementation
feature: mixtogether
title: MixTogether implementation record
status: in-progress
---

# MixTogether implementation record

## Baseline

- Branch: `feat/mixtogether` (the approved plan's naming; AI DevKit's generic checker expects `feature-mixtogether`).
- Official baseline checked 2026-09-05: FHEVM Hardhat template `0.4.1`, `@fhevm/solidity` `0.11.1`, Hardhat `2.28.6`, and OpenZeppelin Confidential Contracts `0.5.3`.
- Official Sepolia pair and registry are treated as deploy-time assertions, not compile-time trust.

## Change log

- 2026-09-05: materialized the approved requirements, design, task queue, test strategy, deployment strategy, and monitoring notes.
- 2026-09-05: implemented the authenticated ERC-7984 receiver, confidential ledgers, bounded saver registry, batched draw state machine, guardian controls, withdrawals, claims, pruning, and ACL rotation.
- 2026-09-05: implemented deployment validation, pool deployment, ABI export, and resumable keeper scripts; live Sepolia validation passed for the official mock pair.
- 2026-09-05: built the responsive Vite dashboard, explicit batched reveal flow, session-scoped permit storage, draw controls, unwrap recovery, reduced-motion behavior, and privacy disclosures.
- 2026-09-05: completed receipt-linked transaction feedback with actionable retries and recent-draw history that never exposes winner addresses.
- 2026-09-05: added Hardhat/Vitest/Playwright coverage, CI, security and architecture documentation, demo collateral, and a ready Vercel preview.

## Decisions

- Use the official cUSDC mock pair; custom faucet/wrapper is a deployment-only fallback after an explicit failed validation.
- Keep all draw progress public and all financial magnitude/outcome state encrypted.
- Keep UI domain logic pure and separately tested from wallet, relayer, and browser persistence boundaries.

## Deviations and follow-ups

- Stable RainbowKit currently targets wagmi v2 while the Zama React adapter targets wagmi v3. The app uses wagmi's standard injected connector through an accessible custom wallet control and remains compatible with EIP-1193 browser wallets.
- The official mock USDC faucet simulation passed, so the fallback `MixUSDC` and stock wrapper were intentionally not deployed.
- An encrypted-zero callback is accepted as required and may consume one of the bounded registry slots because Solidity cannot branch on its private value.
- A live pool address, source verification, prize funding, and deployed two-wallet/HCU smoke test remain pending a funded Sepolia deployer.
- Public GitHub publication remains pending renewal of the local GitHub CLI credential.
