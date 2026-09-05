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
- 2026-09-05: completed formal requirements and design reviews against current Zama protocol, Solidity, and React SDK guidance; expanded the design's trust, ACL, data, API, recovery, HCU, and rollback models.
- 2026-09-05: recorded `exitDrawId` at withdrawal, skipped pending exits during pruning until the draw id advances, cleared exit metadata on redeposit/prune, and added OPEN-withdrawal eligibility coverage; regenerated the exported pool ABI.
- 2026-09-05: prioritized Zama `txHash` in transaction feedback normalization while retaining viem and nested receipt/transaction fallbacks, with malformed-hash rejection coverage.
- 2026-09-05: aligned dashboard award language to “Nominal prize,” reserve-dependent wording, and “Confidential outcome,” including browser assertions and a privacy-safe selection action label.
- 2026-09-05: added exhaustive 65-wallet boundary (`RegistryFull`) and cross-wallet ACL tests; fixed `MixTogetherPool.sol` `_zeroFor` initialization to generate distinct private zero handles using random zero values (`FHE.sub(r, r)` with `r = FHE.randEuint64()`), eliminating an ACL leak where registered savers shared deterministic `FHE.asEuint64(0)` allowances.
- 2026-09-05: implemented mocked Playwright connected saver journey across desktop and mobile Chromium with in-page FSM store, minimal EIP-1193 chain transport, and Zama SDK mock aliases under `VITE_E2E_MOCK=1` on dedicated port 4174; verified zero mock leakage into production build.
- 2026-09-05: implemented repo-root gitignored `.env` loading for Hardhat, keeper, and Vite (`envDir`) with resolver unit tests; confirmed fail-closed Sepolia account configuration and scaffolded gitignored `.env` template.
- 2026-09-05: created public GitHub repository `MrSufferer/mixtogether` and pushed `feat/mixtogether`; confirmed `isPrivate=false` and CI workflow trigger.
## Decisions

- Use the official cUSDC mock pair; custom faucet/wrapper is a deployment-only fallback after an explicit failed validation.
- Keep all draw progress public and all financial magnitude/outcome state encrypted.
- Keep UI domain logic pure and separately tested from wallet, relayer, and browser persistence boundaries.

## Deviations and follow-ups

- Stable RainbowKit currently targets wagmi v2 while the Zama React adapter targets wagmi v3. The app uses wagmi's standard injected connector through an accessible custom wallet control and remains compatible with EIP-1193 browser wallets.
- The official mock USDC faucet simulation passed, so the fallback `MixUSDC` and stock wrapper were intentionally not deployed.
- An encrypted-zero callback is accepted as required and may consume one of the bounded registry slots because Solidity cannot branch on its private value.
- A live pool address, source verification, prize funding, and deployed two-wallet/HCU smoke test remain pending a funded Sepolia deployer key entered in the gitignored `.env`.
- GitHub CLI credential is authenticated as `MrSufferer`; public repository creation and push is unblocked.
- GitHub repository `MrSufferer/mixtogether` is created and public at <https://github.com/MrSufferer/mixtogether>; CI is active on `feat/mixtogether`.
- Live Sepolia deployment, HCU receipts, and reserve funding remain blocked by external deployer key funding and are not claimed as locally complete.
## Phase 7 alignment review — 2026-09-05

- Contract design alignment: `exitDrawId` is public metadata only; encrypted principal, weight, reserve, and winnings remain ciphertext handles with unchanged ACL boundaries. Pruning remains permissionless and idempotent, skipping empty, non-exited, and not-yet-matured slots while processing other supplied slots.
- Client design alignment: transaction feedback now follows the documented `txHash` → `hash` → `transactionHash` → nested receipt/transaction precedence, and malformed candidates remain rejected before explorer-link construction.
- Privacy-copy alignment: the nominal 10 cUSDC display is explicitly non-guaranteed, reserve-dependent, and history uses “Confidential outcome”; no winner or positive-award assertion was added.
- No blocking implementation findings remain. The only lint deviation is the accepted branch naming mismatch; release blockers are external Sepolia/GitHub prerequisites.

## Phase 8/9 handoff — 2026-09-05

- Fresh local evidence: `pnpm check`, `pnpm build`, `pnpm test:e2e`, `pnpm audit --prod --audit-level high`, `git diff --check`, and targeted red/green regressions all completed successfully (audit: no known vulnerabilities; contract: 15 passed; web: 13 passed; browser: 6 passed across preview and journey suites).
- Review outcome: ready for local handoff; do not claim Sepolia deployment, live HCU/two-wallet evidence, or public publication until operator credentials and funds are supplied.
