---
phase: requirements
feature: mixtogether
title: MixTogether requirements
status: approved
---

# MixTogether requirements

MixTogether is an experimental Sepolia prize-savings dApp. It preserves PoolTogether's no-loss premise while using Zama FHEVM and ERC-7984 cUSDC to keep balances, time-weighted chances, randomness, reserves, and winnings confidential.

## Goals

- Let a Sepolia wallet faucet mock USDC, shield to the official cUSDC mock, save confidentially, reveal only its own balances, claim privately, withdraw principal at any time, and optionally unshield.
- Run one permissionless, five-minute, single-winner draw with at most 64 savers and eight saver slots per processing transaction.
- Keep principal, prize reserve, and unclaimed winnings as separate encrypted liabilities; principal never funds prizes.
- Ship contracts, a Vite React interface, tests, keeper/deployment tooling, documentation, release collateral, and public preview artifacts.

## Fixed v1 rules

- Chain: Sepolia (`11155111`) only.
- cUSDC mock: `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`.
- Underlying mock USDC: `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF`.
- Nominal award: `10_000_000` cUSDC base units.
- Epoch: 300 seconds. Registry: 64 slots. Batch size: 8.
- Ticket precision: `100_000` base-unit-seconds; score is `floor(principal / 100_000) * eligibleSeconds`.
- One winner. Immutable parameters. No production funds or non-Sepolia tokens.

## Required behavior

1. Deposits and prize funding enter only through `confidentialTransferAndCall`, authenticated to the configured cUSDC address and tagged with `DEPOSIT = 1` or `PRIZE = 2`.
2. The callback accounts for the actual transferred encrypted amount, including zero transfers.
3. Deposits are accepted only in `OPEN`; withdrawals and claims remain available in every phase.
4. Draw advancement is permissionless: `OPEN -> ACCRUE -> RANDOMIZE -> SELECT -> OPEN`.
5. Selection rewrites every active saver winnings handle and restores the reserved award on zero weight or no selected interval.
6. Encrypted state receives persistent ACL grants for the contract and relevant user; token transfers use transient grants.
7. The guardian can pause deposits and use two-step ownership transfer, but cannot halt exits or draws, pick winners, change balances, move funds, or change constants.
8. Events reveal addresses and progress only; they never emit encrypted handles or amounts.

## Privacy boundary

Encrypted: cUSDC balance, principal, per-saver/total weights, odds, random value, ticket, reserve, winner result, and winnings. Public: participation addresses, transaction timing, draw progress, nominal award, shield/unshield amounts, and callers of claim/withdraw. The product must never render an unrevealed encrypted value as zero.

## Acceptance criteria

- Contract, web, lint, typecheck, unit, accessibility, production-build, and browser-flow gates pass locally.
- Sepolia address/decimals/wrapper/registry/faucet validation is recorded before deployment.
- Eight-slot accrual and selection stay within contemporary Sepolia HCU limits.
- README prominently marks the project unaudited, testnet-only, and privacy-boundary limitations.
- Release collateral contains a demo script under three minutes, X thread, artwork, and submission checklist.

## Non-goals

- Mainnet support, wallet anonymity, guaranteed hosted keepers, real strategy yield, multiple winners, configurable draw parameters, or audited-production readiness.
