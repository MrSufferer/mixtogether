---
phase: requirements
feature: mixtogether
title: MixTogether requirements
status: approved
reviewed: 2026-09-05
---

# MixTogether requirements

MixTogether is an experimental Sepolia prize-savings dApp. It preserves PoolTogether's no-loss premise while using Zama FHEVM and ERC-7984 cUSDC to keep balances, time-weighted chances, randomness, reserves, and winnings confidential.

## Problem statement

Conventional public prize-savings pools reveal each wallet's deposits, balance changes, chances, and winnings. That disclosure makes financial behavior easy to profile and can discourage privacy-conscious users from participating. MixTogether demonstrates that savers can retain withdrawable principal and verifiable onchain draw execution without publishing those financial magnitudes or the winner's identity.

The primary users are Sepolia savers evaluating confidential finance, judges reviewing an end-to-end Zama application, and permissionless operators advancing a bounded draw. The current workaround is either a transparent pool that leaks financial state or an offchain/private operator that weakens verifiability and custody guarantees.

## Goals and objectives

- Let a Sepolia wallet faucet mock USDC, shield to the official cUSDC mock, save confidentially, reveal only its own balances, claim privately, withdraw principal at any time, and optionally unshield.
- Run recurring permissionless five-minute draws with at most 64 savers and eight occupied saver slots per processing transaction; each positive-weight draw selects exactly one confidential winning interval.
- Keep principal, prize reserve, and unclaimed winnings as separate encrypted liabilities; principal never funds prizes.
- Ship contracts, a Vite React interface, tests, keeper/deployment tooling, documentation, release collateral, and public preview artifacts.

## User stories and key workflows

- As a saver, I can obtain mock USDC, approve the exact public amount, shield it to cUSDC, and deposit confidentially so the deposited amount is not exposed by the pool.
- As a saver, I can explicitly initiate one reveal that decrypts my cUSDC, principal, and winnings together; the wallet signs only when a valid session permit is absent, and no signature or decrypted value is requested before that action.
- As a saver, I can withdraw all principal or submit a zero-valid winnings claim during every draw phase so draw processing never traps my funds.
- As a saver, I can request asynchronous public unshielding and recover pending request identifiers after a reload.
- As any funded Sepolia account, I can advance the current draw in resumable batches and see which operation is valid next.
- As a reviewer, I can verify public phase progress, immutable parameters, source, receipts, and accounting invariants without learning private amounts or a winner address.
- As a guardian, I can pause only new deposits and transfer that narrow role in two steps; I cannot alter balances, parameters, winners, exits, claims, or draw liveness.

The primary saver journey is faucet → exact approval → shield → confidential deposit → explicit reveal → draw advancement → reveal/claim → confidential withdrawal → optional public unshield. Expected failure paths include wrong network, wallet rejection, unavailable relayer/KMS, insufficient public funds, missing approval, encrypted zero, full registry, closed deposits, stale draw calls, and pending unshield finalization.

## Fixed v1 rules

- Chain: Sepolia (`11155111`) only.
- cUSDC mock: `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`.
- Underlying mock USDC: `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF`.
- Nominal award: `10_000_000` cUSDC base units.
- Epoch: 300 seconds. Registry: 64 slots. Batch size: 8.
- Ticket precision: `100_000` base-unit-seconds; score is `floor(principal / 100_000) * eligibleSeconds`.
- One confidential winning interval when total weight is positive; a zero-weight or unselected draw has no winner and restores its reserved award. Immutable parameters. No production funds or non-Sepolia tokens.

## Functional requirements

1. Deposits and prize funding enter only through `confidentialTransferAndCall`, authenticated to the configured cUSDC address and tagged with `DEPOSIT = 1` or `PRIZE = 2`.
2. The callback accounts for the actual transferred encrypted amount, including zero transfers.
3. Deposits are accepted only in `OPEN`; withdrawals and claims remain available in every phase. A withdrawal freezes eligibility earned through its applicable accrual endpoint, and its slot cannot be pruned until that draw finalizes.
4. Draw advancement is permissionless: `OPEN -> ACCRUE -> RANDOMIZE -> SELECT -> OPEN`.
5. Randomization reserves `min(encryptedReserve, 10_000_000)`, so the private award may be below the nominal prize when the reserve is underfunded. Selection credits at most one encrypted interval, rewrites every active saver winnings handle, and restores the reserved award on zero weight or no selected interval.
6. Randomization uses an encrypted `euint128` product and a public 64-bit right shift to map the encrypted random word into the encrypted total-weight interval without encrypted division.
7. Encrypted state receives persistent ACL grants for the contract and relevant user; token transfers use transient grants. The current reserve handle is decryptable only by the current guardian for operational diagnosis.
8. The guardian can pause deposits and use two-step ownership transfer, but cannot halt exits or draws, pick winners, change balances, move funds, or change constants. Ownership acceptance rotates the reserve into a fresh ciphertext handle for the incoming guardian because historical ACL grants cannot be revoked.
9. Pool events reveal addresses and progress only; they never emit encrypted handles or amounts. Official wrapper events still expose the public shield/unshield boundary described below.

The public contract interface includes the authenticated receiver callback, `withdrawAll`, `claimWinnings`, all four draw-advancement operations, `pruneExited` for up to eight slots, deposit pause controls, encrypted principal/winnings getters, draw state, saver/slot getters, and exit metadata including the draw id that gates pruning. Only the configured cUSDC token is supported.

## Privacy boundary

Encrypted: cUSDC balance, principal, per-saver/total weights, odds, random value, ticket, reserve, winner result, and winnings. Public: participation addresses, transaction timing, draw progress, nominal award, shield/unshield amounts, and callers of claim/withdraw. The product must never render an unrevealed encrypted value as zero.

A claim transaction is not cryptographic proof of a win because an encrypted zero claim remains valid. Timing correlations and wallet identity remain public and must be disclosed prominently. SDK persistent data uses IndexedDB while permit credentials use browser-session storage. The permit is valid for at most one day and cannot outlive the browser session; account, chain, disconnect, or session changes clear locally decrypted information. A prior guardian may retain a historical reserve snapshot it was previously authorized to decrypt, but never receives access to the fresh reserve handle created after ownership transfer.

## UX and accessibility requirements

- Use the MixTogether name, “Private savings. Provable chances.” primary tagline, and “Save together. Win in secret.” supporting copy consistently.
- Present one responsive dashboard with wallet/network state, a clearly labeled nominal-prize countdown, draw phase, blurred private cards, adaptive actions, saver/batch progress, history entries labeled “Confidential outcome,” and one contextual draw action that explains resumable multi-transaction batching. Because interval selection and award size are encrypted, history must not publicly assert either a winner or a positive award.
- Provide receipt-backed pending/confirmed/error feedback, retries, and Sepolia explorer links without fabricating balances, odds, winners, or completion.
- Use keyboard-operable controls, labeled inputs, visible focus, live status/error regions, mobile bottom sheets or equivalently safe layouts, and reduced-motion fallbacks.
- Use the midnight-plum, violet, cream, aqua, and coral visual system with Fraunces display type and Plus Jakarta Sans UI type. Keep ticket motes and pool-fill motion gentle and savings-oriented; trigger local-only confetti only after the user decrypts a positive prize. Avoid casino urgency, flashing jackpots, or manipulative scarcity.

## Acceptance criteria

- Contract tests cover callback authentication and actuals, encrypted zero, repeated deposits, cutoff accrual, claims and withdrawals in every phase, pre/post-cutoff exits, draw-delayed pruning, quantization, the 65th-wallet boundary, slot reuse and re-entry, pause scope, resumable transitions, deterministic selection boundaries, no-winner and underfunded awards, all-handle rewrites, guardian rotation, cross-wallet ACL denial, liability invariants, and exactly one encrypted credit when positive weight and award exist.
- Web gates cover number display, explicit reveal/cache clearing, draw-action eligibility, unwrap persistence and event recovery, Zama `{ txHash, receipt }` feedback, accessibility, responsive/reduced-motion behavior, typecheck, lint, production build, and a mocked desktop/mobile journey through connect, faucet, shield, deposit, reveal, advance, claim, withdraw, and resumed unshield.
- `pnpm check`, `pnpm build`, `pnpm test:e2e`, and `pnpm audit --prod --audit-level high` pass before handoff; the production audit has no high-severity finding.
- Sepolia preflight records chain `11155111`, deployed code, six-decimal assets, underlying/wrapper relationship, 1:1 rate, registry validity, and a judge-accessible faucet path.
- A release deployment has verified source and constructor arguments, a committed address manifest/ABI, 100 cUSDC in the confidential prize reserve, and real full eight-slot accrual and selection receipts within contemporary total and sequential HCU limits.
- A two-wallet Sepolia release test covers faucet, shielding, differently timed deposits, explicit balance reveals, complete draw advancement, positive-prize reveal, claim, confidential principal withdrawal, recoverable public unshield, and denial of unauthorized cross-wallet decryption.
- The transaction-enabled Vercel deployment has COOP `same-origin`, COEP `require-corp`, no backend/database, correct public addresses, and no application console errors in the supported flow.
- A public `MrSufferer/mixtogether` repository contains the MIT license, CI, environment example, verified addresses, scripts, architecture/security disclosures, a normal-speed real-person demo script and shot list under three minutes, X thread, reviewed screenshots/OG artwork, and the submission checklist.
- README and interface prominently mark the project unaudited, testnet-only, mock-asset-only, and disclose the wallet/timing and public shield/unshield boundaries.

## Constraints and accepted assumptions

- Zama FHEVM operation cost and HCU depth require a bounded 64-slot registry and resumable eight-slot batches; a live Sepolia HCU run remains authoritative over local estimates.
- The official Sepolia mock pair is used because its code, relationship, registry entry, decimals, rate, and public faucet path validated successfully. The conditional `MixUSDC` plus stock OpenZeppelin wrapper fallback is therefore not part of this deployment.
- Prize funding is a permissionlessly supplied confidential mock reserve, not strategy yield. A future yield adapter may fund the same prize callback without changing depositor accounting.
- Because the reserve is private, the interface presents 10 cUSDC as a nominal prize rather than a guaranteed award; an underfunded draw awards the encrypted reserve actually available, including zero.
- Draw liveness comes from public UI actions and the keeper CLI. No hosted keeper SLA, backend, indexer, or database is required.
- The current guardian defaults to the funded Sepolia deployer unless an explicit `GUARDIAN_ADDRESS` is provided. Its authority remains limited to pausing new deposits and two-step role transfer.
- An encrypted-zero deposit cannot be rejected based on plaintext and may occupy a registry slot until normal exit/pruning rules reclaim it.
- The public 64-slot registry is an FHE cost bound, not Sybil resistance. Coordinated wallets can exhaust it; that availability risk is accepted for this bounded testnet demonstration and must not be hidden behind a false capacity claim.
- Random range scaling uses a bounded multiply-and-shift mapping with negligible bias; this trade-off is accepted for v1.
- Browser FHE integration uses the current stable `@zama-fhe/sdk` and React SDK 3.x APIs; their addresses and result shapes are revalidated before release rather than assumed stable.
- Browser wallets must expose an EIP-1193 provider. The UI uses wagmi's injected connector because the current stable RainbowKit and Zama React adapter major versions are incompatible.
- The feature branch remains `feat/mixtogether`; AI DevKit's branch-existence lint expects `feature-mixtogether`, so that single convention check is an accepted tooling deviation rather than a missing branch.
- Deployment credentials, GitHub authentication, the final venue URL/deadline, and demo upload are operator-supplied release inputs and never belong in the repository or Vite environment.

## Accepted decisions and alternatives

- Official mock token pair over a custom token: minimizes unaudited confidential-token code and preserves the official faucet/wrapper path.
- Permissionless batched liveness over a hosted keeper: keeps judging and recovery open to anyone at the cost of multiple transactions.
- Fixed bounded parameters over an unbounded registry: sacrifices capacity for predictable encrypted-computation cost.
- Public participation with private amounts over wallet anonymity: delivers the intended FHE accounting without claiming mixer-like privacy.
- Confidential mock reserve over a yield strategy: proves principal segregation now while leaving strategy integration outside v1.

## Non-goals

- Mainnet support, wallet anonymity, guaranteed hosted keepers, real strategy yield, multiple winners, configurable draw parameters, or audited-production readiness.

## Rollout and validation

1. Keep the current no-key Vercel preview transaction-disabled and `noindex` while release credentials are absent.
2. Validate the official Sepolia token pair immediately before contract deployment.
3. Deploy and verify the pool from a funded non-test signer, then commit the manifest and exported ABI.
4. Fund the confidential reserve, execute the real eight-slot and two-wallet checks, and retain receipts as release evidence.
5. Configure the public pool address, redeploy the transaction-enabled site, verify headers and browser behavior, then publish the GitHub repository.
6. Record/upload the demo and replace preview URLs only after every onchain release gate passes.

Rollback never mutates or upgrades an existing pool. A faulty immutable deployment is superseded by a new address; the web app can return to the previous deployment while the guardian pauses only new deposits on the faulty pool.

## Questions and open items

No product or architecture question blocks the approved v1 requirements. The following items are explicitly deferred release work rather than unresolved scope:

- A funded Sepolia deployer, optional distinct guardian, and Etherscan credential must be supplied through Hardhat/operator configuration.
- Real Sepolia HCU and two-wallet evidence, source verification, 100 cUSDC reserve funding, and the transaction-enabled web deployment remain mandatory release gates.
- GitHub CLI must be reauthenticated as `MrSufferer` before public repository creation and CI visibility checks.
- The submission venue URL, deadline, and uploaded demo URL were not supplied; record them in the submission checklist when available.
